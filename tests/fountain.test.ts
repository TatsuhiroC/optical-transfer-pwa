import { describe, expect, it } from "vitest";
import { LTDecoder, LTEncoder } from "../shared/fountain";
import { fnv1a } from "../shared/protocol";

const LANE_OFFSET = 0x80000000; // send.ts lane B base

function payload(n: number, seed = 7): Uint8Array {
  const out = new Uint8Array(n);
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    out[i] = s >>> 24;
  }
  return out;
}

/**
 * Stream frames at the sender into a decoder, in the order a camera would see
 * them, until it completes or the budget runs out. `seqOf` maps a stream index
 * to the sequence number the sender would put on that frame.
 */
function transfer(
  data: Uint8Array,
  blockLen: number,
  { seqOf = (i: number) => i, budget = 4 } = {},
): { out: Uint8Array; frames: number; complete: boolean } {
  const enc = new LTEncoder(data, blockLen, 0x4321);
  const dec = new LTDecoder(enc.k, blockLen, 0x4321, data.length);
  const limit = Math.ceil(enc.k * budget);
  let frames = 0;
  while (!dec.isComplete && frames < limit) {
    const seq = seqOf(frames);
    dec.addFrame(seq, enc.encode(seq));
    frames++;
  }
  return { out: dec.assemble()!, frames, complete: dec.isComplete };
}

describe("LT fountain code", () => {
  it("rebuilds a small payload exactly", () => {
    const data = payload(5000);
    const { out, complete } = transfer(data, 415); // 500 B/frame preset
    expect(complete).toBe(true);
    expect(fnv1a(out)).toBe(fnv1a(data));
    expect([...out]).toEqual([...data]);
  });

  it("rebuilds across dozens of blocks at the densest frame", () => {
    const data = payload(200_000);
    const { out, frames, complete } = transfer(data, 2868); // 2953 B/frame preset
    expect(complete).toBe(true);
    expect(out.length).toBe(data.length);
    expect(fnv1a(out)).toBe(fnv1a(data));
    expect(frames).toBeLessThan(70 * 1.6); // k=70, ~1.18x overhead plus slack
  });

  it("rebuilds more than four thousand blocks with loss and shuffled batches", () => {
    const data = payload(415 * 4096 - 7);
    const enc = new LTEncoder(data, 415, 0x4321);
    const dec = new LTDecoder(enc.k, 415, 0x4321, data.length);
    for (let base = 0; base < enc.k * 4 && !dec.isComplete; base += 16) {
      for (let offset = 15; offset >= 0 && !dec.isComplete; offset--) {
        const seq = base + offset;
        if (seq % 3 !== 0) dec.addFrame(seq, enc.encode(seq));
      }
    }
    expect(dec.isComplete).toBe(true);
    expect(dec.assemble()).toEqual(data);
  });

  it("pads and trims the tail block correctly", () => {
    // 100 bytes over two blocks: the second block is mostly padding and must not
    // leak into the assembled file
    const data = payload(2868 + 100);
    const { out, complete } = transfer(data, 2868);
    expect(complete).toBe(true);
    expect(out.length).toBe(data.length);
    expect([...out.subarray(2868)]).toEqual([...data.subarray(2868)]);
  });

  it("survives ~1 in 3 frames never arriving", () => {
    const data = payload(20_000);
    const { out, complete } = transfer(data, 1000, { seqOf: (i) => Math.floor((i * 3) / 2) });
    expect(complete).toBe(true);
    expect(fnv1a(out)).toBe(fnv1a(data));
  });

  it("ignores duplicate frames but still counts them", () => {
    const data = payload(4000);
    const enc = new LTEncoder(data, 415, 0x4321);
    const dec = new LTDecoder(enc.k, 415, 0x4321, data.length);
    for (let seq = 0; seq < 200; seq++) {
      dec.addFrame(seq, enc.encode(seq));
    }
    const fresh = dec.framesNew;
    expect(fresh).toBe(200);
    for (let seq = 0; seq < 200; seq++) {
      dec.addFrame(seq, enc.encode(seq));
    }
    expect(dec.framesNew).toBe(fresh);
    expect(dec.framesDup).toBe(200);
    expect(dec.solvedCount).toBeLessThanOrEqual(enc.k);
  });

  it("restores the stream from either dual-lane sequence range", () => {
    const data = payload(30_000);
    const { out, frames, complete } = transfer(data, 1465, {
      seqOf: (i) => (i % 2 === 0 ? i / 2 : LANE_OFFSET + (i - 1) / 2),
    });
    expect(complete).toBe(true);
    expect(fnv1a(out)).toBe(fnv1a(data));
    // lane B tops the decoder up at the same rate lane A would alone
    expect(frames).toBeLessThan(30_000 / 1465 * 1.6);
  });

  it("hands back nothing until every block is solved", () => {
    const data = payload(9000);
    const enc = new LTEncoder(data, 415, 0x4321);
    const dec = new LTDecoder(enc.k, 415, 0x4321, data.length);
    dec.addFrame(0, enc.encode(0));
    dec.addFrame(1, enc.encode(1));
    expect(dec.isComplete).toBe(false);
    expect(dec.assemble()).toBeNull();
  });
});
