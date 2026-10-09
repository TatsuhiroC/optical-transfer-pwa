import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import QRCode from "qrcode";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { packFrame, parseFrame, fnv1a } from "../shared/protocol";
import sharp from "sharp";
import { createInviteQr, PUBLIC_HOME_URL } from "../src/invite";

it("the invitation QR opens the public home page rather than an APK internal origin", async () => {
  prepareZXingModule({
    overrides: {
      wasmBinary: readFileSync(
        "node_modules/zxing-wasm/dist/reader/zxing_reader.wasm",
      ),
    },
  });
  const url = await createInviteQr();
  const svg = decodeURIComponent(url.slice(url.indexOf(",") + 1));
  // Check the actual vector shown by the UI at its narrow-phone display size.
  const png = await sharp(Buffer.from(svg)).resize(238, 238).png().toBuffer();
  const decoded = await readBarcodes(png, { formats: ["QRCode"] });
  expect(decoded).toHaveLength(1);
  expect(decoded[0]!.text).toBe(
    "https://tatsuhiroc.github.io/optical-transfer-pwa/",
  );
  expect(decoded[0]!.text).toBe(PUBLIC_HOME_URL);
});

it("actual QR PNG and ZXing WASM preserve binary frame bytes at 500 and 2953 bytes", async () => {
  prepareZXingModule({
    overrides: {
      wasmBinary: readFileSync(
        "node_modules/zxing-wasm/dist/reader/zxing_reader.wasm",
      ),
    },
  });
  for (const frameBytes of [500, 2953]) {
    const n = frameBytes - 85;
    const payload = new Uint8Array(n).map((_, i) => i % 256);
    const frame = packFrame(
      {
        sessionId: 1234,
        seq: 0,
        k: 1,
        blockLen: n,
        totalLen: n,
        payloadFnv: fnv1a(payload),
      },
      payload,
      "报告.bin",
    );
    const png = await QRCode.toBuffer(
      [{ data: frame, mode: "byte" } as unknown as QRCode.QRCodeSegment],
      { scale: 6, margin: 4, errorCorrectionLevel: "L", maskPattern: 4 },
    );
    const decoded = await readBarcodes(png, {
      formats: ["QRCode"],
      maxNumberOfSymbols: 2,
    });
    expect(decoded.length).toBe(1);
    expect([...decoded[0]!.bytes]).toEqual([...frame]);
    expect(parseFrame(decoded[0]!.bytes)?.name).toBe("报告.bin");
  }
});
