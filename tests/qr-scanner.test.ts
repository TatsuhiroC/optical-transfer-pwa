import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import QRCode from "qrcode";
import sharp from "sharp";
import { prepareZXingModule, readBarcodes, type ReadResult, type ReaderOptions } from "zxing-wasm/reader";
import { AdaptiveQRScanner } from "../src/qr-scanner";
import { LTDecoder, LTEncoder } from "../shared/fountain";
import { fnv1a, packFrame, parseFrame } from "../shared/protocol";

beforeAll(() => {
  vi.stubGlobal("ImageData", class {
    colorSpace = "srgb";
    constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
  });
  prepareZXingModule({ overrides: { wasmBinary: readFileSync("node_modules/zxing-wasm/dist/reader/zxing_reader.wasm") } });
});
afterAll(() => vi.unstubAllGlobals());

function frame(seq = 0, sessionId = 13) {
  const payload = Uint8Array.from({ length: 415 }, (_, i) => (i * 29 + 3) & 255);
  return packFrame({ seq, sessionId, k: 1, blockLen: 415, totalLen: 415, payloadFnv: fnv1a(payload) }, payload, "photo.jpg");
}
function image(codes: { bytes: Uint8Array; x: number; y: number }[], width = 960, height = 720): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  data.fill(55);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  for (const code of codes) {
    const qr = QRCode.create([{ data: code.bytes, mode: "byte" } as unknown as QRCode.QRCodeSegment], { errorCorrectionLevel: "L", maskPattern: 4 });
    const size = (qr.modules.size + 8) * 3;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const mx = Math.floor(x / 3) - 4, my = Math.floor(y / 3) - 4;
      const value = mx >= 0 && my >= 0 && mx < qr.modules.size && my < qr.modules.size && qr.modules.data[my * qr.modules.size + mx] ? 0 : 255;
      const offset = ((code.y + y) * width + code.x + x) * 4;
      data[offset] = data[offset + 1] = data[offset + 2] = value;
    }
  }
  return new ImageData(data, width, height);
}
const readImage = (image: ImageData, options: ReaderOptions) => readBarcodes(image, options);
function bytes(results: ReadResult[]) { return results.filter((r) => r.isValid).map((r) => [...r.bytes]); }

it("tracks actual ZXing positions without downscaling or disabling robust reader options", async () => {
  let now = 0;
  const read = vi.fn(readImage);
  const scanner = new AdaptiveQRScanner(read, () => now);
  const first = frame(), second = frame(1);
  expect(bytes(await scanner.scan(image([{ bytes: first, x: 210, y: 180 }])))).toEqual([[...first]]);
  now += 30;
  expect(bytes(await scanner.scan(image([{ bytes: second, x: 218, y: 187 }])))).toEqual([[...second]]);
  expect(read.mock.calls[1]![0].width).toBeLessThan(960);
  expect(read.mock.calls.every(([, options]) => options?.tryHarder === undefined && options?.tryRotate === undefined && options?.tryInvert === undefined && options?.tryDownscale === undefined)).toBe(true);
});

it("retries the same full capture after a large move, then tracks the new location", async () => {
  const read = vi.fn(readImage), scanner = new AdaptiveQRScanner(read, () => 0);
  await scanner.scan(image([{ bytes: frame(), x: 40, y: 40 }]));
  const moved = image([{ bytes: frame(2), x: 630, y: 400 }]);
  expect(bytes(await scanner.scan(moved))).toEqual([[...frame(2)]]);
  expect(read.mock.calls.at(-1)![0]).toBe(moved);
  read.mockClear();
  expect(bytes(await scanner.scan(moved))).toEqual([[...frame(2)]]);
  expect(read).toHaveBeenCalledOnce();
  expect(read.mock.calls[0]![0].width).toBeLessThan(960);
});

it("periodically searches the full capture for a second code outside the tracked region", async () => {
  let now = 0;
  const scanner = new AdaptiveQRScanner(readBarcodes, () => now);
  await scanner.scan(image([{ bytes: frame(), x: 60, y: 180 }]));
  const dual = image([{ bytes: frame(1), x: 60, y: 180 }, { bytes: frame(0x80000001), x: 600, y: 180 }]);
  now = 10;
  expect(bytes(await scanner.scan(dual))).toHaveLength(1);
  now = 501;
  expect(bytes(await scanner.scan(dual)).sort()).toEqual([[...frame(1)], [...frame(0x80000001)]].sort());
});

it("bounds the number of cropped captures between full searches even when time advances slowly", async () => {
  const original = image([{ bytes: frame(), x: 210, y: 180 }]);
  const read = vi.fn(readImage), scanner = new AdaptiveQRScanner(read, () => 0);
  for (let i = 0; i < 9; i++) await scanner.scan(original);
  expect(read.mock.calls[0]![0]).toBe(original);
  expect(read.mock.calls.slice(1, 8).every(([input]) => input.width < original.width)).toBe(true);
  expect(read.mock.calls[8]![0]).toBe(original);
});

it("keeps recovering when one code disappears, the image is blank, and a new session arrives", async () => {
  const scanner = new AdaptiveQRScanner(readBarcodes, () => 0);
  expect(bytes(await scanner.scan(image([{ bytes: frame(), x: 60, y: 180 }, { bytes: frame(1), x: 600, y: 180 }])))).toHaveLength(2);
  expect(bytes(await scanner.scan(image([{ bytes: frame(2), x: 600, y: 180 }])))).toEqual([[...frame(2)]]);
  expect(await scanner.scan(image([]))).toHaveLength(0);
  expect(bytes(await scanner.scan(image([{ bytes: frame(3, 999), x: 40, y: 20 }])))).toEqual([[...frame(3, 999)]]);
});

it("supports rotated captures, dimension changes, and an explicit full-image mode", async () => {
  const original = image([{ bytes: frame(), x: 210, y: 180 }]);
  const { data, info } = await sharp(original.data, { raw: { width: original.width, height: original.height, channels: 4 } }).rotate(22, { background: "#373737" }).raw().toBuffer({ resolveWithObject: true });
  const rotated = new ImageData(new Uint8ClampedArray(data), info.width, info.height);
  const read = vi.fn(readImage), scanner = new AdaptiveQRScanner(read, () => 0);
  await scanner.scan(original);
  expect(bytes(await scanner.scan(rotated))).toEqual([[...frame()]]);
  expect(read.mock.calls.at(-1)![0]).toBe(rotated);
  read.mockClear();
  await scanner.scan(rotated, false); await scanner.scan(rotated, false);
  expect(read.mock.calls.every(([input]) => input === rotated)).toBe(true);
});

it("recovers from a crop reader exception and backs off after consecutive tracking failures", async () => {
  const original = image([{ bytes: frame(), x: 210, y: 180 }]);
  const decoded = await readBarcodes(original, { formats: ["QRCode"] });
  const read = vi.fn(readImage)
    .mockResolvedValueOnce(decoded).mockRejectedValueOnce(new Error("crop failure")).mockResolvedValueOnce(decoded)
    .mockResolvedValueOnce([]).mockResolvedValueOnce(decoded).mockResolvedValueOnce(decoded);
  const scanner = new AdaptiveQRScanner(read, () => 0);
  await scanner.scan(original);
  expect(bytes(await scanner.scan(original))).toEqual([[...frame()]]);
  expect(bytes(await scanner.scan(original))).toEqual([[...frame()]]);
  expect(bytes(await scanner.scan(original))).toEqual([[...frame()]]);
  expect(read.mock.calls.at(-1)![0]).toBe(original); // cooldown: no crop attempt
});

it("invalid transfer headers cannot lock tracking to an unrelated QR", async () => {
  const bad = frame(); new DataView(bad.buffer).setUint32(12, 0xffffffff, true);
  const original = image([{ bytes: bad, x: 210, y: 180 }]);
  const read = vi.fn(readImage), scanner = new AdaptiveQRScanner(read, () => 0);
  // Leave invalid results visible to the existing receiver validation/error UI.
  expect(bytes(await scanner.scan(original))).toEqual([[...bad]]);
  await scanner.scan(original);
  expect(read.mock.calls.every(([input]) => input === original)).toBe(true);
});

it("actually rebuilds a file through QR tracking with dropped frames, duplicates and camera movement", async () => {
  const payload = Uint8Array.from({ length: 5000 }, (_, i) => (i * 37 + 11) & 255);
  const encoder = new LTEncoder(payload, 415, 13);
  const decoder = new LTDecoder(encoder.k, 415, 13, payload.length);
  const scanner = new AdaptiveQRScanner(readBarcodes, () => 0);
  for (let seq = 0; seq < 100 && !decoder.isComplete; seq++) {
    if (seq % 3 === 0) continue;
    const packed = packFrame({ sessionId: 13, seq, k: encoder.k, blockLen: 415, totalLen: payload.length, payloadFnv: fnv1a(payload) }, encoder.encode(seq), "photo.jpg");
    for (const result of await scanner.scan(image([{ bytes: packed, x: seq < 8 ? 40 : 600, y: seq < 8 ? 40 : 400 }]))) {
      const parsed = parseFrame(result.bytes)!;
      decoder.addFrame(parsed.header.seq, parsed.block);
      decoder.addFrame(parsed.header.seq, parsed.block); // repeated camera frame
    }
  }
  expect(decoder.framesDup).toBeGreaterThan(0);
  expect(decoder.isComplete).toBe(true);
  expect(decoder.assemble()).toEqual(payload);
});
