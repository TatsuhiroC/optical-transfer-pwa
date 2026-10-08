import type { ReaderOptions, ReadResult } from "zxing-wasm/reader";
import { headerReject, MAX_TRANSFER_BYTES, parseFrame } from "../shared/protocol";

type Rect = { x: number; y: number; width: number; height: number };
type Reader = (image: ImageData, options: ReaderOptions) => Promise<ReadResult[]>;

// Keep ZXing's robust defaults. Cropping removes background pixels, not QR
// modules or error correction. Full-image retries use the same captured frame.
const OPTIONS: ReaderOptions = { formats: ["QRCode"], maxNumberOfSymbols: 2 };
const SEARCH_INTERVAL_MS = 500;
const SEARCH_INTERVAL_FRAMES = 8;

function transferCodes(results: ReadResult[]): ReadResult[] {
  return results.filter((r) => {
    if (!r.isValid) return false;
    const parsed = parseFrame(r.bytes);
    return parsed !== null && !headerReject(parsed.header) && parsed.header.totalLen <= MAX_TRANSFER_BYTES;
  });
}

function bounds(results: ReadResult[], width: number, height: number): Rect | null {
  const points = results.flatMap((r) => Object.values(r.position));
  if (!points.length || points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  // Space for the quiet zone and moderate hand movement, including rotated QRs.
  const pad = Math.max(32, Math.ceil(Math.max(maxX - minX, maxY - minY) * 0.15));
  const x = Math.max(0, Math.floor(minX - pad));
  const y = Math.max(0, Math.floor(minY - pad));
  const right = Math.min(width, Math.ceil(maxX + pad));
  const bottom = Math.min(height, Math.ceil(maxY + pad));
  if (right <= x || bottom <= y || (right - x) * (bottom - y) >= width * height * 0.85) return null;
  return { x, y, width: right - x, height: bottom - y };
}

function crop(image: ImageData, rect: Rect): ImageData {
  const data = new Uint8ClampedArray(rect.width * rect.height * 4);
  for (let y = 0; y < rect.height; y++) {
    const start = ((rect.y + y) * image.width + rect.x) * 4;
    data.set(image.data.subarray(start, start + rect.width * 4), y * rect.width * 4);
  }
  return new ImageData(data, rect.width, rect.height);
}

export class AdaptiveQRScanner {
  private region: Rect | null = null;
  private expectedCodes = 0;
  private width = 0;
  private height = 0;
  private sinceFull = 0;
  private lastFull = -Infinity;
  private misses = 0;
  private cooldownUntil = 0;

  constructor(private readonly read: Reader, private readonly clock = () => performance.now()) {}

  async scan(image: ImageData, track = true): Promise<ReadResult[]> {
    const now = this.clock();
    if (image.width !== this.width || image.height !== this.height || !track) {
      this.region = null;
      this.expectedCodes = 0;
      this.misses = 0;
      this.cooldownUntil = 0;
      this.width = image.width;
      this.height = image.height;
    }
    let results: ReadResult[];
    const rect = this.region;
    const useRegion = track && rect && now >= this.cooldownUntil &&
      this.sinceFull < SEARCH_INTERVAL_FRAMES - 1 && now - this.lastFull < SEARCH_INTERVAL_MS;
    if (useRegion) {
      let local: ReadResult[] = [];
      try { local = await this.read(crop(image, rect), OPTIONS); } catch { /* Retry full frame below. */ }
      if (transferCodes(local).length >= this.expectedCodes) {
        results = local.map((r) => ({ ...r, position: {
          topLeft: { x: r.position.topLeft.x + rect.x, y: r.position.topLeft.y + rect.y },
          topRight: { x: r.position.topRight.x + rect.x, y: r.position.topRight.y + rect.y },
          bottomLeft: { x: r.position.bottomLeft.x + rect.x, y: r.position.bottomLeft.y + rect.y },
          bottomRight: { x: r.position.bottomRight.x + rect.x, y: r.position.bottomRight.y + rect.y },
        } }));
        this.sinceFull++;
        this.misses = 0;
      } else {
        this.misses++;
        if (this.misses >= 2) this.cooldownUntil = now + SEARCH_INTERVAL_MS;
        results = await this.full(image, now);
      }
    } else {
      results = await this.full(image, now);
    }
    const codes = transferCodes(results);
    this.region = track ? bounds(codes, image.width, image.height) : null;
    this.expectedCodes = codes.length;
    return results;
  }

  private async full(image: ImageData, now: number): Promise<ReadResult[]> {
    // Clear stale tracking before awaiting: an exception must leave the next
    // call searching the whole frame, rather than stuck on old coordinates.
    this.region = null;
    this.lastFull = now;
    this.sinceFull = 0;
    return this.read(image, OPTIONS);
  }
}
