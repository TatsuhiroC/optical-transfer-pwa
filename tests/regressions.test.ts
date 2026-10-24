// Regression coverage for the input, lifecycle and native bridge defects found in the audit.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import QRCode from 'qrcode';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DecodeLimitError, LTDecoder, LTEncoder } from '../shared/fountain';
import { fnv1a, headerReject, packFrame, parseFrame, type TransferKind } from '../shared/protocol';

const bridge = vi.hoisted(() => ({ native: false, write: vi.fn(), getUri: vi.fn(), share: vi.fn(), deleteFile: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => bridge.native } }));
vi.mock('@capacitor/filesystem', () => ({ Directory: { Documents: 'DOCUMENTS', Cache: 'CACHE' }, Filesystem: { writeFile: bridge.write, getUri: bridge.getUri, deleteFile: bridge.deleteFile } }));
vi.mock('@capacitor/share', () => ({ Share: { share: bridge.share } }));

class Element {
  className = ''; id = ''; readOnly = false;
  textContent = ''; style: Record<string, string> = {}; hidden = false; disabled = false;
  options = [500, 1000, 1465, 1850, 2331, 2431, 2953].map(n => ({ value: String(n), disabled: false }));
  events = new Map<string, (event?: unknown) => unknown>();
  attributes = new Map<string, string>();
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  focus = vi.fn(); select = vi.fn();
  value = ''; children: Element[] = []; files: unknown[] = []; srcObject: unknown;
  parentElement?: { clientWidth: number; getBoundingClientRect?: () => { top: number } };
  videoWidth = 0; videoHeight = 0; offsetWidth = 0;
  onclick: (() => unknown) | null = null; onchange: (() => unknown) | null = null;
  classList = { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() };
  append(e: Element) { this.children.push(e); }
  querySelector() { return this; }
  querySelectorAll() { return []; }
  addEventListener(name: string, cb: (event?: unknown) => unknown) { this.events.set(name, cb); }
  context = { putImageData: vi.fn(), drawImage: vi.fn() };
  getContext() { return this.context; }
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
function frame(data = new Uint8Array([7]), hash = fnv1a(data), name = 'test.bin', kind: TransferKind = 'file') {
  return packFrame({ sessionId: 1234, seq: 0, k: 1, blockLen: data.length, totalLen: data.length, payloadFnv: hash }, data, name, kind);
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
      const baseVersion = JSON.parse(readFileSync('package.json', 'utf8')).version;
      const expectedVersion = type === 'tag' ? '2.0.0' : `${baseVersion}-dev.${run}`;
      expect(gradle).toContain(`versionName "${expectedVersion}`);
    }
  expect(codes).toEqual([100000011, 100000012, 100000013]);
    const finalGradle = readFileSync(join(folder, 'app/build.gradle'), 'utf8');
    expect(finalGradle.match(/versionCode /g)).toHaveLength(1);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

it('QR capacity table matches the supported byte presets', () => {
  const accepted: Record<string, number[]> = { L: [], M: [], Q: [], H: [] };
  for (const ecc of ['L', 'M', 'Q', 'H'] as const) for (const n of [500, 1000, 1465, 1850, 2331, 2431, 2953]) {
    try { QRCode.create([{ data: new Uint8Array(n), mode: 'byte' } as unknown as QRCode.QRCodeSegment], { errorCorrectionLevel: ecc }); accepted[ecc]!.push(n); } catch {}
  }
  expect(accepted).toEqual({ L: [500, 1000, 1465, 1850, 2331, 2431, 2953], M: [500, 1000, 1465, 1850, 2331], Q: [500, 1000, 1465], H: [500, 1000] });
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
  el('file-input').files = [{ name: 'two-codes.bin', type: '', size: 900, arrayBuffer: async () => new Uint8Array(900).buffer }];
  el('file-input').onchange?.(); await settle();
  expect(el('stage').hidden).toBe(false);
  expect(parseFloat(el('qr').style.width!)).toBeLessThanOrEqual(338);
  const tick = vi.mocked(requestAnimationFrame).mock.calls[0]![0];
  tick(1000);
  expect(el('qr').context.drawImage).toHaveBeenCalledOnce();
  const staging = el('qr').context.drawImage.mock.calls[0]![0] as Element;
  expect(staging.context.putImageData).toHaveBeenCalledTimes(2);
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

it.each(['wallet.sqlite','map.geojson','slides.keynote','.gitignore','file.custom-type','file.数据'])('preserves %s through native saving and forwarding', async name => {
  bridge.native=true;await receiver();FakeWorker.all[0]!.emit(frame(undefined,undefined,name));
  el('result').children.find(x=>x.textContent==='Save file')!.click();await settle();
  expect(bridge.write).toHaveBeenCalledWith(expect.objectContaining({path:name}));
  el('result').children.at(-1)!.click();const {store}=await import('../src/store');expect(store.pending!.name).toBe(name);
});
it('translates the whole completed summary and does not report infinite throughput', async () => {
  await receiver();FakeWorker.all[0]!.emit(frame());
  expect(el('stats').textContent).not.toContain('Infinity');expect(el('stats').textContent).toContain('— KB/s');
  const {setLang}=await import('../src/i18n');setLang('zh');
  expect(el('stats').textContent).toContain('哈希校验通过');expect(el('stats').textContent).not.toContain('verified');
});
it('does not construct web Files on Android or browsers without file sharing', async () => {
  const makeFile=vi.fn();vi.stubGlobal('File',makeFile);bridge.native=true;
  const receive=await receiver();FakeWorker.all[0]!.emit(frame());expect(makeFile).not.toHaveBeenCalled();
  receive.exitReceive();bridge.native=false;await receiver();FakeWorker.all.at(-1)!.emit(frame());expect(makeFile).not.toHaveBeenCalled();
});
it('keeps save and forward actions if the browser file-sharing probe throws', async () => {
  Object.assign(navigator,{share:vi.fn(),canShare:()=>{throw new Error('unsupported');}});
  await receiver();expect(()=>FakeWorker.all[0]!.emit(frame())).not.toThrow();
  expect(el('result').children.some(x=>x.textContent==='Save file')).toBe(true);
  expect(el('result').children.at(-1)!.textContent).toBe('Send onward');
});

it('shares the received bytes and original long filename when web file sharing is available', async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { share, canShare: () => true });
  await receiver();
  FakeWorker.all[0]!.emit(frame(undefined, undefined, 'map.geojson'));
  el('result').children.find(x => x.textContent === 'Share')!.click();
  await settle();
  const file = share.mock.calls[0]![0].files[0] as File;
  expect(file.name).toBe('map.geojson');
  expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array([7]));
});

it('sends UTF-8 text unchanged and invalidates an older pending file read', async () => {
  let resolve!: (value: ArrayBuffer) => void;
  const sender = await import('../src/send'); sender.enterSend();
  el('file-input').files = [{ name: 'old.bin', size: 1, type: '', arrayBuffer: () => new Promise<ArrayBuffer>(r => { resolve = r; }) }];
  el('file-input').onchange?.();
  el('send-mode-text').click();
  const text = '  你好，世界 👋\nhttps://example.com/?q=$&\n<script>alert(1)</script>  ';
  el('text-input').value = text;
  el('text-input').events.get('input')?.();
  expect(el('text-start').disabled).toBe(false);
  el('text-form').events.get('submit')?.({ preventDefault() {} });
  resolve(new Uint8Array([99]).buffer); await settle();
  const { store } = await import('../src/store');
  expect(store.pending!.name).toBe('message.txt');
  expect(store.pending!.mime).toBe('text/plain');
  expect(store.pending!.kind).toBe('text');
  expect(new TextDecoder().decode(store.pending!.payload)).toBe(text);
  expect(el('stage').hidden).toBe(false);
  sender.exitSend();
});

it.each(['ascii', 'multibyte'])('blocks empty and oversized %s text while retaining the draft across mode changes', async kind => {
  const sender = await import('../src/send'); sender.enterSend();
  el('send-mode-text').click();
  el('text-input').value = ' \n\t'; el('text-input').events.get('input')?.();
  expect(el('text-start').disabled).toBe(true);
  el('text-form').events.get('submit')?.({ preventDefault() {} });
  const { store } = await import('../src/store'); expect(store.pending).toBeNull();
  el('text-input').value = kind === 'ascii' ? 'a'.repeat(4 * 1024 * 1024 + 1) : '光'.repeat(Math.floor(4 * 1024 * 1024 / 3) + 1);
  el('text-input').events.get('input')?.();
  expect(el('text-start').disabled).toBe(true);
  expect(el('text-error').textContent).toContain('4 MiB');
  el('text-form').events.get('submit')?.({ preventDefault() {} });
  expect(store.pending).toBeNull();
  el('text-input').value = 'draft 你好';
  el('send-mode-file').click(); el('send-mode-text').click();
  expect(el('text-input').value).toBe('draft 你好');
  expect(el('text-start').disabled).toBe(false);
  sender.exitSend();
  el('text-form').events.get('submit')?.({ preventDefault() {} });
  expect(store.pending).toBeNull();
});

it('shows verified text as literal content and copies the original text on web and Android', async () => {
  bridge.native = true;
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  await receiver();
  const text = 'ID3: 你好 👋\n<img src=x onerror=alert(1)>\n  keep spaces  ';
  const bytes = new TextEncoder().encode(text);
  FakeWorker.all[0]!.emit(frame(bytes, fnv1a(bytes), 'message.txt', 'text'));
  const panel = el('result').children.find(x => x.className === 'received-text-panel')!;
  const content = panel.children.find(x => x.id === 'received-text')!;
  expect(content.value).toBe(text);
  expect(content.children).toHaveLength(0);
  expect(content.readOnly).toBe(true);
  await panel.children.find(x => x.textContent === 'Copy text')!.click();
  expect(writeText).toHaveBeenCalledWith(text);
  expect(panel.children.at(-1)!.textContent).toBe('Text copied.');
  const { setLang } = await import('../src/i18n'); setLang('zh');
  expect(panel.children.at(-1)!.textContent).toBe('文字已复制。');
  el('result').children.at(-1)!.click();
  const { store } = await import('../src/store');
  expect(store.pending!.payload).toEqual(bytes);
  expect(store.pending!.kind).toBe('text');
});

it.each(['missing', 'denied'])('selects received text for manual copying when the clipboard is %s', async mode => {
  Object.assign(navigator, { clipboard: mode === 'missing' ? undefined : { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
  await receiver();
  FakeWorker.all[0]!.emit(frame(new TextEncoder().encode('hello'), undefined, 'message.txt', 'text'));
  const panel = el('result').children.find(x => x.className === 'received-text-panel')!;
  await panel.children.find(x => x.textContent === 'Copy text')!.click();
  const content = panel.children.find(x => x.id === 'received-text')!;
  expect(content.focus).toHaveBeenCalledOnce();
  expect(content.select).toHaveBeenCalledOnce();
  expect(panel.children.at(-1)!.textContent).toContain('manually');
  expect(el('result').children.some(x => x.textContent === 'Save file')).toBe(true);
});

it('keeps invalid UTF-8 text downloadable without showing a corrupt text preview', async () => {
  await receiver();
  FakeWorker.all[0]!.emit(frame(new Uint8Array([0xc3, 0x28]), undefined, 'invalid.txt', 'text'));
  expect(el('result').children.some(x => x.className === 'received-text-panel')).toBe(false);
  expect(el('result').children.some(x => x.textContent === 'Save file')).toBe(true);
});

it('does not apply a completed clipboard request to a receiver that has been closed', async () => {
  let complete!: () => void;
  Object.assign(navigator, { clipboard: { writeText: () => new Promise<void>(resolve => { complete = resolve; }) } });
  const receive = await receiver();
  FakeWorker.all[0]!.emit(frame(new TextEncoder().encode('hello'), undefined, 'message.txt', 'text'));
  const panel = el('result').children.find(x => x.className === 'received-text-panel')!;
  const pending = panel.children.find(x => x.textContent === 'Copy text')!.click();
  receive.exitReceive(); complete(); await pending;
  expect(panel.children.at(-1)!.textContent).toBe('');
});


it('accepts text drops in the editor and still handles dropped files', async () => {
  const sender = await import('../src/send'); sender.enterSend();
  el('send-mode-text').click();
  const preventDefault = vi.fn();
  el('dropzone').events.get('dragover')?.({ preventDefault, dataTransfer: { types: ['text/plain'] } });
  el('dropzone').events.get('drop')?.({ preventDefault, dataTransfer: { files: [] } });
  expect(preventDefault).not.toHaveBeenCalled();
  const file = { name: 'dropped.bin', type: '', size: 1, arrayBuffer: async () => new Uint8Array([42]).buffer };
  el('dropzone').events.get('drop')?.({ preventDefault, dataTransfer: { files: [file] } });
  await settle();
  expect(preventDefault).toHaveBeenCalledOnce();
  const { store } = await import('../src/store');
  expect(store.pending!.name).toBe('dropped.bin');
  expect([...store.pending!.payload]).toEqual([42]);
  expect(el('send-mode-file').getAttribute('aria-pressed')).toBe('true');
  sender.exitSend();
});


it.each([1, 415])('sends a %s-byte file in one static QR, including the exact capacity boundary', async length => {
  const create = vi.spyOn(QRCode, 'create');
  try {
    const payload = Uint8Array.from({ length }, (_, i) => i % 256);
    const sender = await import('../src/send'); sender.enterSend();
    el('file-input').files = [{ name: '小文件.bin', type: '', size: length, arrayBuffer: async () => payload.buffer }];
    el('file-input').onchange?.(); await settle();
    expect(create).toHaveBeenCalledOnce();
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    const bytes = (create.mock.calls[0]![0] as unknown as { data: Uint8Array }[])[0]!.data;
    const parsed = parseFrame(bytes)!;
    expect(parsed.header).toMatchObject({ k: 1, seq: 0, blockLen: length, totalLen: length, payloadFnv: fnv1a(payload) });
    expect(parsed.block).toEqual(payload);
    expect(parsed.kind).toBe('file');
    expect(el('specs').textContent).toContain('Static code');
    sender.exitSend();
    await receiver(); FakeWorker.all[0]!.emit(bytes);
    expect(el('stats').textContent).toContain('verified');
    el('result').children.at(-1)!.click();
    const { store } = await import('../src/store');
    expect(store.pending!.payload).toEqual(payload);
    expect(store.pending!.name).toBe('小文件.bin');
  } finally { create.mockRestore(); }
});

it('uses dynamic transmission when the payload exceeds the single-code capacity by one byte', async () => {
  const sender = await import('../src/send'); sender.enterSend();
  el('file-input').files = [{ name: 'boundary.bin', type: '', size: 416, arrayBuffer: async () => new Uint8Array(416).buffer }];
  el('file-input').onchange?.(); await settle();
  expect(requestAnimationFrame).toHaveBeenCalledOnce();
  expect(el('specs').textContent).toContain('target 24 fps');
  expect(el('stage').hidden).toBe(false);
  sender.exitSend();
});

it('keeps a short Unicode message in one code even with two lanes selected; resizing reuses the code', async () => {
  const create = vi.spyOn(QRCode, 'create');
  try {
    el('cfg-lanes').value = '2';
    const sender = await import('../src/send'); sender.enterSend();
    el('send-mode-text').click();
    const text = '  你好，Optical Transfer 👋\nhttps://example.com/  ';
    el('text-input').value = text;
    el('text-form').events.get('submit')?.({ preventDefault() {} });
    expect(create).toHaveBeenCalledOnce();
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(el('qr').style.width).toBe(el('qr').style.height);
    const listeners = vi.mocked(window.addEventListener).mock.calls as unknown as [string, () => void][];
    const resize = listeners.find(([type]) => type === 'resize')![1];
    Object.assign(window, { innerWidth: 1366, innerHeight: 768 }); resize();
    expect(create).toHaveBeenCalledOnce();
    expect(el('qr').context.drawImage).toHaveBeenCalledTimes(2);
    expect(el('qr').style.width).toBe(el('qr').style.height);
    vi.advanceTimersByTime(2000);
    expect(create).toHaveBeenCalledOnce();
    const bytes = (create.mock.calls[0]![0] as unknown as { data: Uint8Array }[])[0]!.data;
    el('btn-stop').click(); await settle();
    expect(el('stage').hidden).toBe(true);
    expect(release).toHaveBeenCalled();
    el('btn-resend').click();
    expect(create).toHaveBeenCalledTimes(2);
    sender.exitSend();
    await receiver(); FakeWorker.all[0]!.emit(bytes);
    const panel = el('result').children.find(x => x.className === 'received-text-panel')!;
    expect(panel.children.find(x => x.id === 'received-text')!.value).toBe(text);
    expect(el('stats').textContent).toContain('verified');
  } finally { create.mockRestore(); }
});

it('shows a recoverable error if static QR generation fails', async () => {
  const create = vi.spyOn(QRCode, 'create').mockImplementation(() => { throw Error('QR fixture failure'); });
  try {
    const sender = await import('../src/send'); sender.enterSend();
    el('file-input').files = [{ name: 'tiny.bin', type: '', size: 1, arrayBuffer: async () => new Uint8Array([7]).buffer }];
    el('file-input').onchange?.(); await settle();
    expect(el('specs').textContent).toContain('QR fixture failure');
    expect(el('stage').hidden).toBe(true);
    expect(el('btn-resend').hidden).toBe(false);
    expect(lock).not.toHaveBeenCalled();
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    sender.exitSend();
  } finally { create.mockRestore(); }
});


it.each(['notes.txt', 'message.txt', 'NOTES.TXT'])('receives a selected %s as a file and preserves its kind when forwarded', async name => {
  const create = vi.spyOn(QRCode, 'create');
  try {
    const bytes = new TextEncoder().encode('相同的文字内容 👋\n');
    const sender = await import('../src/send'); sender.enterSend();
    el('file-input').files = [{ name, type: 'text/plain', size: bytes.length, arrayBuffer: async () => bytes.buffer }];
    el('file-input').onchange?.(); await settle();
    const encoded = (create.mock.calls[0]![0] as unknown as { data: Uint8Array }[])[0]!.data;
    expect(parseFrame(encoded)!.kind).toBe('file');
    sender.exitSend(); await receiver(); FakeWorker.all[0]!.emit(encoded);
    expect(el('result').children.some(x => x.className === 'received-text-panel')).toBe(false);
    expect(el('result').children.some(x => x.textContent === 'Your file has arrived.')).toBe(true);
    expect(el('result').children.some(x => x.textContent === 'Save file')).toBe(true);
    el('result').children.at(-1)!.click();
    const { store } = await import('../src/store');
    expect(store.pending).toMatchObject({ name, kind: 'file', payload: bytes });
    sender.enterSend();
    const forwarded = (create.mock.calls.at(-1)![0] as unknown as { data: Uint8Array }[])[0]!.data;
    expect(parseFrame(forwarded)!.kind).toBe('file');
    expect(parseFrame(forwarded)!.name).toBe(name);
    sender.exitSend();
  } finally { create.mockRestore(); }
});

it('treats old unmarked TXT transfers as files instead of guessing from the name', async () => {
  await receiver();
  FakeWorker.all[0]!.emit(frame(new TextEncoder().encode('legacy text'), undefined, 'message.txt'));
  expect(el('result').children.some(x => x.className === 'received-text-panel')).toBe(false);
  expect(el('result').children.some(x => x.textContent === 'Save file')).toBe(true);
});

it('does not mistake explicitly sent text for a file based on its leading magic bytes', async () => {
  await receiver();
  const text = 'GIF89a 这仍是输入的文字';
  FakeWorker.all[0]!.emit(frame(new TextEncoder().encode(text), undefined, 'message.txt', 'text'));
  const panel = el('result').children.find(x => x.className === 'received-text-panel')!;
  expect(panel.children.find(x => x.id === 'received-text')!.value).toBe(text);
  expect(el('result').children.some(x => x.className === 'received')).toBe(false);
});

it('rejects changed transfer kinds within one dynamic session and preserves text through forwarding', async () => {
  await receiver();
  const payload = new TextEncoder().encode('动态文字：'.repeat(100));
  const enc = new LTEncoder(payload, Math.ceil(payload.length / 2), 1234);
  const frames = Array.from({ length: 100 }, (_, seq) => ({ seq, b: enc.encode(seq) }));
  // Choose a pair that completes the stream with no earlier frames required.
  const first = frames.find(x => {
    const probe = new LTDecoder(2, enc.blockLen, 1234, payload.length);
    probe.addFrame(x.seq, x.b);
    return probe.solvedCount === 1;
  })!;
  const second = frames.find(x => {
    const probe = new LTDecoder(2, enc.blockLen, 1234, payload.length);
    probe.addFrame(first.seq, first.b); probe.addFrame(x.seq, x.b);
    return probe.isComplete;
  })!;
  const pack = (f: typeof first, kind: TransferKind) => packFrame({ sessionId: 1234, seq: f.seq, k: 2, blockLen: enc.blockLen, totalLen: payload.length, payloadFnv: fnv1a(payload) }, f.b, 'message.txt', kind);
  FakeWorker.all[0]!.emit(pack(first, 'text'));
  FakeWorker.all[0]!.emit(pack(second, 'file'));
  expect(el('stats').textContent).toContain('invalid');
  expect(el('result').children).toHaveLength(0);
  FakeWorker.all[0]!.emit(pack(second, 'text'));
  expect(el('stats').textContent).toContain('verified');
  el('result').children.at(-1)!.click();
  const { store } = await import('../src/store');
  expect(store.pending!.kind).toBe('text');
  const create = vi.spyOn(QRCode, 'create');
  try {
    const sender = await import('../src/send'); sender.enterSend();
    expect(create.mock.calls.length).toBeGreaterThan(1);
    for (const call of create.mock.calls) {
      const encoded = (call[0] as unknown as { data: Uint8Array }[])[0]!.data;
      expect(parseFrame(encoded)!.kind).toBe('text');
    }
    sender.exitSend();
  } finally { create.mockRestore(); }
});


it('constrains the new L-capacity preset to a supported size when M is selected', async () => {
  el('cfg-bytes').value = '2431'; el('cfg-ecc').value = 'M';
  const sender = await import('../src/send'); sender.enterSend();
  expect(el('cfg-bytes').value).toBe('2331');
  expect(el('cfg-bytes').options.find(x => x.value === '2431')!.disabled).toBe(true);
  sender.exitSend();
});

it('fills the former default QR version without increasing its module count or reducing its error correction', () => {
  const make = (bytes: number) => QRCode.create([{ data: new Uint8Array(bytes), mode: 'byte' } as unknown as QRCode.QRCodeSegment], { errorCorrectionLevel: 'L' });
  const previous = make(2331); const full = make(2431); const next = make(2432);
  expect(previous.version).toBe(36);
  expect(full.version).toBe(previous.version);
  expect(full.modules.size).toBe(previous.modules.size);
  expect(full.errorCorrectionLevel).toEqual(previous.errorCorrectionLevel);
  expect(next.version).toBeGreaterThan(full.version);
});

it('shows MB throughout sending and receiving a 7000 KB file', async () => {
  const payload = new Uint8Array(7000 * 1024);
  const sender = await import('../src/send'); sender.enterSend();
  el('file-input').files = [{ name: 'large.bin', type: '', size: payload.length, arrayBuffer: async () => payload.buffer }];
  el('file-input').onchange?.(); await settle();
  expect(el('file-meta-text').textContent).toBe('large.bin · 6.8 MB');
  sender.exitSend();
  await receiver();
  const encoder = new LTEncoder(payload, 2346, 1234);
  FakeWorker.all[0]!.emit(packFrame({ sessionId: 1234, seq: 0, k: encoder.k, blockLen: 2346, totalLen: payload.length, payloadFnv: fnv1a(payload) }, encoder.encode(0), 'large.bin'));
  vi.advanceTimersByTime(200);
  expect(el('rx-size').textContent).toBe('6.8 MB');
  expect(el('m-payload').textContent).toBe('6.8 MB');
});

it('shows a live ETA, translates it, waits during gaps, and resets it for a new session', async () => {
  await receiver();
  const payload = Uint8Array.from({ length: 1000 }, (_, i) => i % 256);
  const encoder = new LTEncoder(payload, 10, 1234);
  const emit = (seq: number, sessionId = 1234) => {
    const current = sessionId === 1234 ? encoder : new LTEncoder(payload, 10, sessionId);
    FakeWorker.all[0]!.emit(packFrame({ sessionId, seq, k: current.k, blockLen: 10, totalLen: payload.length, payloadFnv: fnv1a(payload) }, current.encode(seq), 'eta.bin'));
  };
  emit(0); expect(el('m-eta').textContent).toBe('Estimating…');
  for (let i = 1; i <= 10; i++) { vi.advanceTimersByTime(100); emit(i); }
  vi.advanceTimersByTime(200);
  expect(el('m-eta').textContent).toMatch(/^~ \d+:\d\d$/);
  expect(el('m-rate').textContent).toMatch(/KB\/s$/);
  const { setLang } = await import('../src/i18n'); setLang('zh');
  expect(el('m-eta').textContent).toMatch(/^约 \d+:\d\d$/);
  vi.advanceTimersByTime(2000);
  expect(el('m-eta').textContent).toBe('等待数据');
  expect(el('m-rate').textContent).toBe('0.0 KB/s');
  emit(11); vi.advanceTimersByTime(200);
  expect(el('m-eta').textContent).toBe('估算中…');
  emit(0, 5678);
  expect(el('m-eta').textContent).toBe('估算中…');
  el('restart').click(); expect(el('m-eta').textContent).toBe('—');
});

it('uses readable MB in a verified large file result and completes ETA', async () => {
  await receiver();
  const payload = new Uint8Array(2 * 1024 ** 2).fill(7);
  const encoder = new LTEncoder(payload, 2868, 1234);
  const hash = fnv1a(payload);
  for (let seq = 0; seq < encoder.k * 4 && !stopped.mock.calls.length; seq++) {
    FakeWorker.all[0]!.emit(packFrame({ sessionId: 1234, seq, k: encoder.k, blockLen: 2868, totalLen: payload.length, payloadFnv: hash }, encoder.encode(seq), 'result.bin'));
  }
  expect(el('stats').textContent).toContain('2.0 MB');
  expect(el('result').children.some(x => x.textContent === 'result.bin · 2.0 MB')).toBe(true);
  expect(el('m-eta').textContent).toBe('0:00');
});
