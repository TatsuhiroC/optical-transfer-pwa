import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import QRCode from 'qrcode';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import { packFrame, parseFrame, fnv1a } from '../shared/protocol';

it('actual QR PNG and ZXing WASM preserve binary frame bytes at 500 and 2953 bytes', async () => {
  prepareZXingModule({ overrides: { wasmBinary: readFileSync('node_modules/zxing-wasm/dist/reader/zxing_reader.wasm') } });
  for (const frameBytes of [500, 2953]) {
    const n = frameBytes - 85;
    const payload = new Uint8Array(n).map((_, i) => i % 256);
    const frame = packFrame({ sessionId: 1234, seq: 0, k: 1, blockLen: n, totalLen: n, payloadFnv: fnv1a(payload) }, payload, '报告.bin');
    const png = await QRCode.toBuffer([{ data: frame, mode: 'byte' } as unknown as QRCode.QRCodeSegment], { scale: 6, margin: 4, errorCorrectionLevel: 'L', maskPattern: 4 });
    const decoded = await readBarcodes(png, { formats: ['QRCode'], maxNumberOfSymbols: 2 });
    expect(decoded.length).toBe(1);
    expect([...decoded[0]!.bytes]).toEqual([...frame]);
    expect(parseFrame(decoded[0]!.bytes)?.name).toBe('报告.bin');
  }
});
