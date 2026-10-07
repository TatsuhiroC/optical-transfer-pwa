// QR decode worker: zxing-cpp compiled to WASM. (Safari has never shipped
// BarcodeDetector — WebKit bug 281848 — so WASM is the only portable way.)
// One frame in flight per worker; the main thread drops frames when all
// workers are busy. Frames are disposable — the fountain doesn't care.

import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";

prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) =>
      path.endsWith(".wasm") ? wasmUrl : prefix + path,
  },
});

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(msg: unknown, transfer?: Transferable[]): void;
};

ctx.onmessage = async (e: MessageEvent) => {
  const { id, buf, w, h } = e.data as { id: number; buf: ArrayBuffer; w: number; h: number };
  try {
    const img = new ImageData(new Uint8ClampedArray(buf), w, h);
    // Dual-lane senders show two codes per screen refresh; decode both and
    // hand every one to the main thread (the fountain decoder dedups by
    // seq, so feeding both lanes into one decoder is safe). Single-code
    // streams simply yield a one-element list.
    const results = await readBarcodes(img, { formats: ["QRCode"], maxNumberOfSymbols: 2 });
    const found = results.filter((x) => x.isValid && x.bytes.length > 0).map((x) => x.bytes);
    ctx.postMessage({ id, bytes: found });
  } catch {
    // No code in this frame (blur, glare, half a symbol) is the common case —
    // report it as an empty result, never as a missing message.
    ctx.postMessage({ id, bytes: null });
  }
};

// warm the WASM so the first real frame doesn't pay instantiation, and report
// whether it actually loaded (the capability pill used to be green either way)
void readBarcodes(new ImageData(8, 8), { formats: ["QRCode"] })
  .then(() => ctx.postMessage({ id: -1, ok: true }))
  .catch(() => ctx.postMessage({ id: -1, ok: false }));
