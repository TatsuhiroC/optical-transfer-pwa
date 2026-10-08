// Regression coverage for the input, lifecycle and native bridge defects found in the audit.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import QRCode from 'qrcode';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DecodeLimitError, LTDecoder, LTEncoder } from '../shared/fountain';
import { fnv1a, headerReject, packFrame } from '../shared/protocol';

const bridge = vi.hoisted(() => ({ native: false, write: vi.fn(), getUri: vi.fn(), share: vi.fn(), deleteFile: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => bridge.native } }));
vi.mock('@capacitor/filesystem', () => ({ Directory: { Documents: 'DOCUMENTS', Cache: 'CACHE' }, Filesystem: { writeFile: bridge.write, getUri: bridge.getUri, deleteFile: bridge.deleteFile } }));
vi.mock('@capacitor/share', () => ({ Share: { share: bridge.share } }));

class Element {
  textContent = ''; style: Record<string, string> = {}; hidden = false; disabled = false;
  options = [500, 1000, 1465, 1850, 2331, 2953].map(n => ({ value: String(n), disabled: false }));
  events = new Map<string, () => void>();
  value = ''; children: Element[] = []; files: unknown[] = []; srcObject: unknown;
  parentElement?: { clientWidth: number; getBoundingClientRect?: () => { top: number } };
  videoWidth = 0; videoHeight = 0; offsetWidth = 0;
  onclick: (() => unknown) | null = null; onchange: (() => unknown) | null = null;
  classList = { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() };
  append(e: Element) { this.children.push(e); }
  querySelector() { return this; }
  querySelectorAll() { return []; }
  addEventListener(name: string, cb: () => void) { this.events.set(name, cb); }
  getContext() { return { putImageData: vi.fn(), drawImage: vi.fn() }; }
  play() { return Promise.resolve(); }
  click() { return this.onclick?.(); }
  set innerHTML(_: string) { this.children = []; }
}
class FakeWorker {
  static all: FakeWorker[] = [];
  onmessage: ((e: unknown) => void) | null = null;
  terminate = vi.fn(); postMessage = vi.fn();
  constructor() { FakeWorker.all.push(this); }
  ready() { this.onmessage?.({ data: { id: -1, ok: true } }); }
  emit(bytes: Uint8Array) { this.onmessage?.({ data: { id: 1, bytes: [bytes] } }); }
}
let els: Map<string, Element>;
let media: { getUserMedia: ReturnType<typeof vi.fn> };
let stopped: ReturnType<typeof vi.fn>;
let release: ReturnType<typeof vi.fn>;
let lock: ReturnType<typeof vi.fn>;
const settle = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const el = (id: string) => {
  if (!els.has(id)) els.set(id, new Element());
  return els.get(id)!;
};
const stream = () => ({ getTracks: () => [{ stop: stopped }] });
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); vi.clearAllMocks();
  bridge.native = false;
  bridge.write.mockResolvedValue({}); bridge.deleteFile.mockResolvedValue({});
  bridge.getUri.mockResolvedValue({ uri: 'file:///storage/emulated/0/Documents/test.bin' });
  bridge.share.mockImplementation(async (options) => {
    if (!options.files.every((f: string) => f.startsWith('file://'))) throw Error('only file urls are supported');
    return {};
  });
  els = new Map(); FakeWorker.all = [];
  stopped = vi.fn(); release = vi.fn().mockResolvedValue(undefined); lock = vi.fn().mockResolvedValue({ release });
  media = { getUserMedia: vi.fn().mockResolvedValue(stream()) };
  vi.stubGlobal('document', { getElementById: el, createElement: () => new Element(), querySelectorAll: () => [], documentElement: {}, addEventListener: vi.fn(), visibilityState: 'visible' });
  vi.stubGlobal('window', { isSecureContext: true, setInterval, setTimeout, addEventListener: vi.fn(), removeEventListener: vi.fn(), innerWidth: 390, innerHeight: 844, devicePixelRatio: 1 });
  vi.stubGlobal('navigator', { mediaDevices: media, language: 'en', wakeLock: { request: lock } });
  vi.stubGlobal('localStorage', { getItem: () => null });
  vi.stubGlobal('location', { hash: '#/receive' });
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('ImageData', class { data: Uint8ClampedArray; constructor(w: number, h: number) { this.data = new Uint8ClampedArray(w * h * 4); } });
  el('cfg-width').value = '1280'; el('cfg-capfps').value = '60'; el('cfg-workers').value = '2';
  el('frame-pulses').children = [new Element()];
  for (const [id, val] of Object.entries({ 'cfg-fps': '24', 'cfg-bytes': '500', 'cfg-ecc': 'L', 'cfg-size': '900', 'cfg-lanes': '1' })) el(id).value = val;
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function receiver() {
  const module = await import('../src/receive'); module.enterReceive(); el('start').click(); await settle(); for (const w of FakeWorker.all) w.ready(); return module;
}
function frame(data = new Uint8Array([7]), hash = fnv1a(data), name = 'test.bin') {
  return packFrame({ sessionId: 1234, seq: 0, k: 1, blockLen: data.length, totalLen: data.length, payloadFnv: hash }, data, name);
}

it('bounds malicious dependent equations even for a two-byte stream', () => {
  const enc = new LTEncoder(new Uint8Array([1, 2]), 1, 1234);
  const dec = new LTDecoder(2, 1, 1234, 2, { maxFrames: 16 });
  expect(headerReject({ k: 2, blockLen: 1, totalLen: 2 })).toBeNull();
  expect(() => {
    for (let seq = 0; seq < 1000; seq++) {
      const block = enc.encode(seq); if (block[0] === 3) dec.addFrame(seq, block);
    }
  }).toThrow(DecodeLimitError);
  expect(dec.framesNew).toBe(16);
  expect(dec.solvedCount).toBe(0);
});

it('bounds graph memory independently of frame count', () => {
  const enc = new LTEncoder(new Uint8Array([1, 2]), 1, 1234);
  const dec = new LTDecoder(2, 1, 1234, 2, { maxBytes: 1024 });
  expect(() => {
    for (let seq = 0; seq < 1000; seq++) {
      const block = enc.encode(seq); if (block[0] === 3) dec.addFrame(seq, block);
    }
  }).toThrow(DecodeLimitError);
  expect(dec.framesNew).toBeLessThan(16);
});

it('rejects changed same-session geometry/hash/name and accepts original frames', async () => {
  await receiver();
  const enc = new LTEncoder(new Uint8Array([1, 2, 3, 4]), 2, 1234);
  const a = Array.from({ length: 100 }, (_, seq) => ({ seq, b: enc.encode(seq) })).find(x => x.b[0] === 1)!;
  const b = Array.from({ length: 100 }, (_, seq) => ({ seq, b: enc.encode(seq) })).find(x => x.b[0] === 3)!;
  FakeWorker.all[0]!.emit(packFrame({ sessionId: 1234, seq: a.seq, k: 2, blockLen: 2, totalLen: 4, payloadFnv: fnv1a(new Uint8Array([1, 2, 3, 4])) }, a.b, 'original.bin'));
  const replacement = new Uint8Array([1, 2, 3, 0]);
  FakeWorker.all[0]!.emit(packFrame({ sessionId: 1234, seq: b.seq, k: 1, blockLen: 1, totalLen: 1, payloadFnv: fnv1a(replacement) }, new Uint8Array([3]), 'replacement.bin'));
  expect(el('stats').textContent).toContain('invalid');
  expect(el('result').children).toHaveLength(0);
  FakeWorker.all[0]!.emit(packFrame({ sessionId: 1234, seq: b.seq, k: 2, blockLen: 2, totalLen: 4, payloadFnv: fnv1a(new Uint8Array([1, 2, 3, 4])) }, b.b, 'original.bin'));
  expect(el('stats').textContent).toContain('original.bin');
  expect(el('stats').textContent).toContain('verified');
  el('result').children.at(-1)!.click();
  const { store } = await import('../src/store');
  expect([...store.pending!.payload]).toEqual([1, 2, 3, 4]);
});

it('hash mismatch never exposes success, preview or export actions', async () => {
  await receiver(); FakeWorker.all[0]!.emit(frame(undefined, 0));
  expect(el('stats').textContent).toContain('verification failed');
  expect(el('result').children).toHaveLength(0);
  const { store } = await import('../src/store'); expect(store.pending).toBeNull();
});

it('batches progress, skips duplicate-frame rendering and still finishes immediately', async () => {
  await receiver();
  const payload = new Uint8Array([1, 2]);
  const encoder = new LTEncoder(payload, 1, 1234);
  const degreeOne = Array.from({ length: 100 }, (_, seq) => ({ seq, data: encoder.encode(seq) }))
    .filter(x => x.data[0] === 1 || x.data[0] === 2);
  const first = degreeOne.find(x => x.data[0] === 1)!;
  const second = degreeOne.find(x => x.data[0] === 2)!;
  const pack = (x: typeof first) => packFrame({ sessionId: 1234, seq: x.seq, k: 2, blockLen: 1, totalLen: 2, payloadFnv: fnv1a(payload) }, x.data, 'batch.bin');
  FakeWorker.all[0]!.emit(pack(first));
  expect(el('bar').style.width).toBe('0%');
  vi.advanceTimersByTime(200);
  expect(el('progress-frames').textContent).toContain('1 /');
  const toggles = el('frame-pulses').children[0]!.classList.toggle;
  const rendered = toggles.mock.calls.length;
  FakeWorker.all[0]!.emit(pack(first)); vi.advanceTimersByTime(200);
  expect(toggles.mock.calls.length).toBe(rendered);
  FakeWorker.all[0]!.emit(pack(second));
  expect(el('bar').style.width).toBe('100%');
  expect(el('stats').textContent).toContain('verified');
});

it('prototype property filename is handled as an unknown extension', async () => {
  await receiver();
  expect(() => FakeWorker.all[0]!.emit(frame(undefined, undefined, 'constructor'))).not.toThrow();
  expect(stopped).toHaveBeenCalled();
  expect(el('result').children.some(x => x.textContent === 'Save file')).toBe(true);
  const { guessMime } = await import('../src/util');
  expect(guessMime('a.__proto__')).toBe('application/octet-stream');
});

it('late camera permission result is stopped after exit', async () => {
  let resolve!: (s: unknown) => void;
  media.getUserMedia.mockImplementation(() => new Promise(r => { resolve = r; }));
  const receive = await import('../src/receive'); receive.enterReceive(); el('start').click();
  receive.exitReceive(); resolve(stream()); await settle();
  expect(stopped).toHaveBeenCalledOnce(); expect(FakeWorker.all.length).toBe(0);
  expect(el('video').srcObject).toBeNull();
});

it('worker reply after restart is ignored and its worker terminated', async () => {
  await receiver(); const oldWorker = FakeWorker.all[0]!;
  el('restart').click(); expect(oldWorker.terminate).toHaveBeenCalledOnce();
  oldWorker.emit(frame()); expect(el('result').children).toHaveLength(0);
});

it('native share passes a file URI and cleans the temporary cache file', async () => {
  bridge.native = true; await receiver(); FakeWorker.all[0]!.emit(frame());
  el('result').children.find(x => x.textContent === 'Share')!.click(); await settle();
  expect(bridge.share).toHaveBeenCalledWith({ title: 'test.bin', files: ['file:///storage/emulated/0/Documents/test.bin'] });
  expect(bridge.write).toHaveBeenCalledWith(expect.objectContaining({ directory: 'CACHE' }));
  expect(bridge.deleteFile).toHaveBeenCalledWith(expect.objectContaining({ directory: 'CACHE' }));
});

it('file read finishing after send exit cannot start hidden sender', async () => {
  let resolve!: (s: ArrayBuffer) => void;
  const file = { name: 'test.bin', type: '', size: 1, arrayBuffer: () => new Promise<ArrayBuffer>(r => { resolve = r; }) };
  const send = await import('../src/send'); send.enterSend();
  el('file-input').files = [file]; el('file-input').onchange?.(); send.exitSend();
  resolve(new Uint8Array([1]).buffer); await settle();
  expect(el('stage').hidden).toBe(true); expect(lock).not.toHaveBeenCalled();
});

it('sender rejects a huge file without reading it', async () => {
  const read = vi.fn().mockResolvedValue(new Uint8Array([1]).buffer);
  const sender = await import('../src/send'); sender.enterSend();
  el('file-input').files = [{ name: 'huge.bin', type: '', size: 5 * 1024 ** 3, arrayBuffer: read }];
  el('file-input').onchange?.(); expect(read).not.toHaveBeenCalled(); await settle();
});

it('stop/exit releases a requested wake lock', async () => {
  const receive = await receiver(); expect(lock).toHaveBeenCalled();
  receive.exitReceive(); expect(release).toHaveBeenCalledOnce();
});

it('preview and downloads release their blob URLs', async () => {
  const create = vi.fn().mockReturnValue('blob:audit-only'); const revoke = vi.fn();
  vi.spyOn(URL, 'createObjectURL').mockImplementation(create);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revoke);
  await receiver();
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]);
  FakeWorker.all[0]!.emit(frame(png, fnv1a(png), 'image.png'));
  const save = el('result').children.find(x => x.textContent === 'Save file')!;
  save.click(); await settle(); save.click(); await settle(); el('restart').click();
  expect(create).toHaveBeenCalledTimes(3); vi.advanceTimersByTime(1000); expect(revoke).toHaveBeenCalledTimes(3);
  vi.restoreAllMocks();
});

it('Android tag and branch version codes increase and config can be regenerated', () => {
  const folder = mkdtempSync(join(tmpdir(), 'optical-audit-version-'));
  try {
    const codes = [];
    for (const [type, name, run] of [['branch', 'main', '11'], ['tag', 'v2.0.0', '12'], ['branch', 'main', '13']]) {
      mkdirSync(join(folder, 'app/src/main'), { recursive: true });
      if (!existsSync(join(folder, 'app/build.gradle'))) writeFileSync(join(folder, 'app/build.gradle'), 'android {}\n');
      writeFileSync(join(folder, 'app/src/main/AndroidManifest.xml'), '<manifest></manifest>');
      const child = spawnSync(process.execPath, ['scripts/prepare-android.mjs', folder], {
        cwd: process.cwd(), encoding: 'utf8',
        env: { ...process.env, GITHUB_REF_TYPE: type, GITHUB_REF_NAME: name, GITHUB_RUN_NUMBER: run,
          ANDROID_KEYSTORE_BASE64: Buffer.alloc(128).toString('base64'), ANDROID_KEYSTORE_PASSWORD: 'fixture', ANDROID_KEY_ALIAS: 'fixture', ANDROID_KEY_PASSWORD: 'fixture', ANDROID_VERSION_CODE: undefined, GITHUB_OUTPUT: '', GITHUB_STEP_SUMMARY: '' },
      });
      expect(child.status).toBe(0);
      codes.push(Number(/versionCode (\d+)/.exec(readFileSync(join(folder, 'app/build.gradle'), 'utf8'))![1]));
      const gradle = readFileSync(join(folder, 'app/build.gradle'), 'utf8');
      const expectedVersion = type === 'tag' ? '2.0.0' : `2.0.0-dev.${run}`;
      expect(gradle).toContain(`versionName "${expectedVersion}`);
    }
  expect(codes).toEqual([100000011, 100000012, 100000013]);
    const finalGradle = readFileSync(join(folder, 'app/build.gradle'), 'utf8');
    expect(finalGradle.match(/versionCode /g)).toHaveLength(1);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

it('QR capacity table matches the supported byte presets', () => {
  const accepted: Record<string, number[]> = { L: [], M: [], Q: [], H: [] };
  for (const ecc of ['L', 'M', 'Q', 'H'] as const) for (const n of [500, 1000, 1465, 1850, 2331, 2953]) {
    try { QRCode.create([{ data: new Uint8Array(n), mode: 'byte' } as unknown as QRCode.QRCodeSegment], { errorCorrectionLevel: ecc }); accepted[ecc]!.push(n); } catch {}
  }
  expect(accepted).toEqual({ L: [500, 1000, 1465, 1850, 2331, 2953], M: [500, 1000, 1465, 1850, 2331], Q: [500, 1000, 1465], H: [500, 1000] });
});

it('native share surfaces actual bridge errors and still deletes its cache file', async () => {
  bridge.native = true; bridge.share.mockRejectedValue(new Error('bridge failed'));
  await receiver(); FakeWorker.all[0]!.emit(frame());
  el('result').children.find(x => x.textContent === 'Share')!.click(); await settle();
  expect(el('stats').textContent).toContain('bridge failed');
  expect(bridge.deleteFile).toHaveBeenCalled();
});

it('permission denial does not prompt a second time and restores controls', async () => {
  media.getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
  await receiver();
  expect(media.getUserMedia).toHaveBeenCalledOnce();
  expect(el('start').style.display).toBe('');
  expect(el('stats').textContent).toContain('permission denied');
});

it('Worker errors stop the camera and provide a restart path', async () => {
  await receiver();
  const w = FakeWorker.all[0] as unknown as { onerror: () => void };
  w.onerror();
  expect(stopped).toHaveBeenCalled();
  expect(el('restart').style.display).toBe('block');
  expect(el('stats').textContent).toContain('stopped responding');
});

it('ECC changes constrain byte presets before starting a QR stream', async () => {
  el('cfg-bytes').value = '2331'; el('cfg-ecc').value = 'H';
  const sender = await import('../src/send'); sender.enterSend();
  expect(el('cfg-bytes').value).toBe('1000');
  const read = vi.fn().mockResolvedValue(new Uint8Array([1]).buffer);
  el('file-input').files = [{ name: 'tiny.bin', type: '', size: 1, arrayBuffer: read }];
  el('file-input').onchange?.(); await settle();
  expect(el('stage').hidden).toBe(false);
  expect(el('specs').textContent).toContain('error correction H');
  sender.exitSend();
});

it('stale asynchronous wake lock grants are immediately released', async () => {
  let grant!: (value: unknown) => void;
  lock.mockImplementation(() => new Promise(resolve => { grant = resolve; }));
  const receive = await receiver(); receive.exitReceive(); grant({ release }); await settle();
  expect(release).toHaveBeenCalledOnce();
});

it('decoder startup timeout stops capture rather than leaving busy workers', async () => {
  const receive = await import('../src/receive'); receive.enterReceive(); el('start').click(); await settle();
  vi.advanceTimersByTime(15000);
  expect(stopped).toHaveBeenCalled();
  expect(FakeWorker.all.every(w => w.terminate.mock.calls.length === 1)).toBe(true);
});

it('legacy frames can complete without a name field', async () => {
  await receiver(); const named = frame();
  const legacy = new Uint8Array(21); legacy.set(named.subarray(0, 20)); legacy[20] = 7;
  FakeWorker.all[0]!.emit(legacy);
  expect(el('stats').textContent).toContain('verified');
  expect(el('stats').textContent).toContain('received.bin');
});

it('file read errors restore the sender activity state and report failure', async () => {
  const sender = await import('../src/send'); sender.enterSend();
  el('file-input').files = [{ name: 'broken.bin', size: 1, type: '', arrayBuffer: () => Promise.reject(new Error('unreadable')) }];
  el('file-input').onchange?.(); await settle();
  const { isTransferActive } = await import('../src/store');
  expect(isTransferActive()).toBe(false);
  expect(el('specs').textContent).toContain('unreadable');
});

it('xcode UUID override remains compatible with its CommonJS v4 caller', async () => {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const xcode = require('xcode');
  const project = xcode.project('fixture.pbxproj');
  project.hash = { project: { objects: {} } };
  expect(project.generateUuid()).toMatch(/^[A-F0-9]{24}$/);
});

it("keeps received progress through a gap and language change, then verifies the file", async () => {
  await receiver();
  const payload = new Uint8Array([1, 2]);
  const encoder = new LTEncoder(payload, 1, 1234);
  const candidates = Array.from({ length: 100 }, (_, seq) => ({
    seq,
    data: encoder.encode(seq),
  }));
  const first = candidates.find((x) => x.data[0] === 1)!;
  const second = candidates.find((x) => x.data[0] === 2)!;
  const pack = (x: typeof first) =>
    packFrame(
      {
        sessionId: 1234,
        seq: x.seq,
        k: 2,
        blockLen: 1,
        totalLen: 2,
        payloadFnv: fnv1a(payload),
      },
      x.data,
      "retained.bin",
    );
  FakeWorker.all[0]!.emit(pack(first));
  vi.advanceTimersByTime(2000);
  expect(el("rx-state").textContent).toBe("Waiting for new data");
  const progress = el("bar").style.width;
  const { setLang } = await import("../src/i18n");
  setLang("zh");
  expect(el("rx-state").textContent).toBe("等待新数据");
  expect(el("bar").style.width).toBe(progress);
  expect(el("result").children).toHaveLength(0);
  FakeWorker.all[0]!.emit(pack(second));
  expect(el("bar").style.width).toBe("100%");
  expect(el("rx-state").textContent).toBe("校验通过");
  expect(el("result").children.some((x) => x.textContent === "保存文件")).toBe(
    true,
  );
});


it('fits both optional QR lanes inside a narrow desktop panel without clipping', async () => {
  Object.assign(window, { innerWidth: 1366, innerHeight: 768 });
  el('stage').parentElement = { clientWidth: 342 };
  el('cfg-lanes').value = '2';
  const sender = await import('../src/send');
  sender.enterSend();
  el('file-input').files = [{ name: 'two-codes.bin', type: '', size: 1, arrayBuffer: async () => new Uint8Array([7]).buffer }];
  el('file-input').onchange?.(); await settle();
  expect(el('stage').hidden).toBe(false);
  expect(parseFloat(el('qr').style.width!)).toBeLessThanOrEqual(338);
  sender.exitSend();
});


it('keeps the code inside the available height of a landscape phone', async () => {
  Object.assign(window, { innerWidth: 844, innerHeight: 390 });
  el('stage').parentElement = { clientWidth: 432, getBoundingClientRect: () => ({ top: 160 }) };
  const sender = await import('../src/send'); sender.enterSend();
  el('file-input').files = [{ name: 'landscape.bin', type: '', size: 1, arrayBuffer: async () => new Uint8Array([9]).buffer }];
  el('file-input').onchange?.(); await settle();
  expect(el('stage').hidden).toBe(false);
  expect(parseFloat(el('qr').style.height!) + 164).toBeLessThan(390);
  sender.exitSend();
});
