import { describe, expect, it } from "vitest";
import {
  HEADER_LEN,
  MAX_BLOCK_LEN,
  NAME_FIELD_LEN,
  NAME_MAX,
  encodeName,
  fnv1a,
  headerReject,
  packFrame,
  parseFrame,
  type FrameHeader,
} from "../shared/protocol";

/** bytes/frame presets offered by the sender UI; payload = preset - overhead. */
const FRAME_BYTES = [500, 1000, 1465, 1850, 2331, 2953];
const blockLenFor = (frameBytes: number) => frameBytes - HEADER_LEN - 1 - NAME_FIELD_LEN;

/** A complete header as the sender builds it, with the fields under test given. */
const headerFor = (
  k: number,
  blockLen: number,
  totalLen: number,
  payloadFnv = 0,
): FrameHeader => ({
  sessionId: 0x1234,
  seq: 0,
  k,
  blockLen,
  totalLen,
  payloadFnv,
});

describe("headerReject", () => {
  it("accepts every header a real sender can emit", () => {
    for (const frameBytes of FRAME_BYTES) {
      const blockLen = blockLenFor(frameBytes);
      const ceiling = Math.min(65535 * blockLen, 4 * 1024 * 1024); // keep the sweep quick
      for (const totalLen of [1, blockLen - 1, blockLen, blockLen + 1, 2 * blockLen, 1000, ceiling]) {
        if (totalLen < 1 || totalLen > 65535 * blockLen) continue;
        const k = Math.ceil(totalLen / blockLen);
        expect(
          headerReject({ k, blockLen, totalLen }),
          `${frameBytes} B/frame, ${totalLen} B payload, k=${k}`,
        ).toBeNull();
      }
    }
  });

  it("accepts the protocol ceiling (k = 65535 at the densest frame)", () => {
    const named = blockLenFor(2953); // densest frame the sender offers
    expect(named).toBeLessThanOrEqual(MAX_BLOCK_LEN);
    expect(headerReject({ k: 65535, blockLen: named, totalLen: 65535 * named })).toBeNull();
    // a legacy frame carries its payload straight after the 20-byte header
    expect(headerReject({ k: 1, blockLen: MAX_BLOCK_LEN, totalLen: MAX_BLOCK_LEN })).toBeNull();
  });

  it("rejects a one-frame stream that declares gigabytes", () => {
    // This is the crafted frame that used to complete the decoder immediately,
    // then make the receiver allocate and hash the declared length in one go.
    for (const totalLen of [0x40000000, 0xffffffff]) {
      expect(headerReject({ k: 1, blockLen: blockLenFor(2953), totalLen })).toEqual({
        kind: "invalid",
        reason: "capacity",
      });
    }
  });

  it("rejects frame payloads no QR code can carry", () => {
    expect(
      headerReject({ k: 2, blockLen: MAX_BLOCK_LEN + 1, totalLen: 2 * (MAX_BLOCK_LEN + 1) }),
    ).toEqual({ kind: "invalid", reason: "blockLen" });
    expect(headerReject({ k: 1, blockLen: MAX_BLOCK_LEN, totalLen: MAX_BLOCK_LEN })).toBeNull();
  });

  it("rejects a block count the declared length cannot fill", () => {
    // k blocks of blockLen hold at least k*blockLen - blockLen + 1 bytes
    expect(headerReject({ k: 3, blockLen: 1000, totalLen: 1500 })).toEqual({
      kind: "invalid",
      reason: "sparse",
    });
    expect(headerReject({ k: 3, blockLen: 1000, totalLen: 2001 })).toBeNull();
  });

  it("rejects zero fields", () => {
    expect(headerReject({ k: 0, blockLen: 1000, totalLen: 1000 })?.reason).toBe("zero");
    expect(headerReject({ k: 1, blockLen: 0, totalLen: 1000 })?.reason).toBe("zero");
    expect(headerReject({ k: 1, blockLen: 1000, totalLen: 0 })?.reason).toBe("zero");
  });
});

describe("frame layout", () => {
  const blockLen = 100;
  const block = new Uint8Array(blockLen).map((_, i) => i);

  it("round-trips header, payload and name", () => {
    const parsed = parseFrame(
      packFrame({ ...headerFor(4, blockLen, 350, 0xdeadbeef), seq: 7 }, block, "holiday.png"),
    );
    expect(parsed?.header).toEqual({ ...headerFor(4, blockLen, 350, 0xdeadbeef), seq: 7 });
    expect([...parsed!.block]).toEqual([...block]);
    expect(parsed?.name).toBe("holiday.png");
  });

  it("still parses legacy frames that predate the name field", () => {
    const named = packFrame(headerFor(4, blockLen, 350), block, "x.png");
    const legacy = new Uint8Array(HEADER_LEN + blockLen);
    legacy.set(named.subarray(0, HEADER_LEN));
    legacy.set(block, HEADER_LEN);
    const parsed = parseFrame(legacy);
    expect(parsed?.header.k).toBe(4);
    expect(parsed?.name).toBe("");
    expect([...parsed!.block]).toEqual([...block]);
  });

  it("rejects frames whose length disagrees with blockLen", () => {
    const good = packFrame(headerFor(4, blockLen, 350), block, "x.png");
    expect(parseFrame(good.subarray(0, good.length - 1))).toBeNull();
    expect(parseFrame(new Uint8Array(HEADER_LEN))).toBeNull();
  });

  it("rejects a frame for a zero-length file (send.ts refuses to send one)", () => {
    expect(parseFrame(packFrame(headerFor(1, blockLen, 0), block, "empty.txt"))).toBeNull();
  });
});

describe("encodeName", () => {
  const block = new Uint8Array(64);

  it("keeps names that fit", () => {
    for (const name of ["photo.png", "报告.docx", "🎂.jpg"]) {
      expect(encodeName(name).length).toBe(new TextEncoder().encode(name).length);
      expect(new TextDecoder().decode(encodeName(name))).toBe(name);
    }
  });

  it("truncates on a code-point boundary and survives the frame round-trip", () => {
    const names = [
      "🎉".repeat(20) + ".png", // 4-byte code points
      "照片" + "🎂".repeat(16) + ".jpg", // mixed 3- and 4-byte
      "à".repeat(40) + ".txt", // 2-byte code points
    ];
    for (const name of names) {
      const enc = encodeName(name);
      expect(enc.length).toBeLessThanOrEqual(NAME_MAX);
      // a strict decoder throws if the cut landed inside a sequence
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(enc);
      expect(decoded).not.toContain("\uFFFD");
      const extension = name.slice(name.lastIndexOf("."));
      expect(decoded.endsWith(extension)).toBe(true);
      expect(name.startsWith(decoded.slice(0, -extension.length))).toBe(true);
      expect(parseFrame(packFrame(headerFor(1, 64, 64), block, name))?.name).toBe(decoded);
    }
  });
});

describe("fnv1a", () => {
  it("is the standard FNV-1a 32-bit hash", () => {
    expect(fnv1a(new Uint8Array(0))).toBe(0x811c9dc5);
    expect(fnv1a(new TextEncoder().encode("a"))).toBe(0xe40c292c);
    expect(fnv1a(new TextEncoder().encode("foobar"))).toBe(0xbf9cf968);
  });
});
