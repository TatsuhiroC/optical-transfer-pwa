// Receive mode: camera → WASM QR decode in workers → fountain decoder → file.
//
// Scan settings and pipeline are unchanged from the original: capture width /
// fps / worker count, `exact` fps demanded first (iOS lies with `ideal`),
// requestVideoFrameCallback with a generation counter against zombie capture
// loops, progress tracking frames COLLECTED (LT peeling back-loads).
// New: the frame name field shows up as the received file name, the result
// offers save / share / send-onward, and the file name/type are verified
// against magic bytes so a stream without a name (legacy frames) still lands
// with the right extension (e.g. a WAV stays a .wav).

import { LTDecoder } from "../shared/fountain";
import { fnv1a, parseFrame } from "../shared/protocol";
import { store } from "./store";
import { guessMime, sniffMime, hasExtension, extForMime } from "./util";
import { t } from "./i18n";

const OVERHEAD_EST = 1.18; // expected frames ≈ K × this (robust-soliton ε)

const startBtn = document.getElementById("start") as HTMLButtonElement;
const video = document.getElementById("video") as HTMLVideoElement;
const rxStage = document.getElementById("rx-stage")!;
const stats = document.getElementById("stats")!;
const progressEl = document.getElementById("progress")!;
const bar = document.getElementById("bar")!;
const result = document.getElementById("result")!;
const settings = document.getElementById("settings") as HTMLDetailsElement;
const metricsEl = document.getElementById("metrics")!;
const metric = (id: string) => document.getElementById(id)!;

let stream: MediaStream | null = null;
let decoder: LTDecoder | null = null;
let sessionId = 0;
let startTs = 0;
let captureGen = 0;
let done = false;
let statsTimer: number | undefined;

const workers: Worker[] = [];
const busy: boolean[] = [];
const captureTimes: number[] = [];
const decodeTimes: number[] = [];

startBtn.onclick = () => void start();

async function start() {
  if (!navigator.mediaDevices?.getUserMedia) {
    // On insecure origins the API doesn't exist AT ALL — this is the plain-
    // http-over-LAN case. localhost is exempt; other hosts need https.
    stats.textContent = t("receive.secure");
    return;
  }
  const captureWidth = Number((document.getElementById("cfg-width") as HTMLSelectElement).value);
  const captureFps = Number((document.getElementById("cfg-capfps") as HTMLSelectElement).value);
  const workerCount = Number((document.getElementById("cfg-workers") as HTMLSelectElement).value);
  settings.style.display = "none";
  startBtn.style.display = "none";
  rxStage.style.display = "block";
  progressEl.style.display = "block";
  metricsEl.style.display = "grid";
  const base: MediaTrackConstraints = {
    facingMode: "environment",
    width: { ideal: captureWidth },
    height: { ideal: Math.round((captureWidth * 3) / 4) },
  };
  try {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { ...base, frameRate: { exact: captureFps } },
      });
    } catch {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { ...base, frameRate: { ideal: captureFps } },
      });
    }
  } catch (err) {
    stats.textContent = t("receive.camErr", { msg: err instanceof Error ? err.message : String(err) });
    return;
  }
  video.srcObject = stream;
  await video.play().catch(() => undefined);
  stats.textContent = t("receive.searching", {
    w: stream.getVideoTracks()[0]?.getSettings().width ?? "?",
    h: stream.getVideoTracks()[0]?.getSettings().height ?? "?",
    fps: stream.getVideoTracks()[0]?.getSettings().frameRate ?? "?",
  });

  for (let i = 0; i < workerCount; i++) {
    const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    const slot = i;
    w.onmessage = (e: MessageEvent) => {
      const { id, bytes } = e.data as { id: number; bytes: Uint8Array | null };
      if (id === -1) return; // warm-up
      busy[slot] = false;
      if (bytes) onDecoded(bytes);
    };
    workers.push(w);
    busy.push(false);
  }

  captureGen++;
  scheduleFrame(captureGen);
  clearInterval(statsTimer);
  statsTimer = window.setInterval(updateStats, 500);
  try {
    await (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<unknown> } })
      .wakeLock?.request("screen");
  } catch {
    /* fine */
  }
}

type VideoRVFC = HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };

function scheduleFrame(gen: number) {
  if (done || gen !== captureGen) return;
  const v = video as VideoRVFC;
  const next = () => {
    if (done || gen !== captureGen) return;
    captureFrame();
    scheduleFrame(gen);
  };
  if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(next);
  else requestAnimationFrame(next);
}

const grab = document.createElement("canvas");
let frameId = 0;

function captureFrame() {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;
  captureTimes.push(performance.now());
  const slot = busy.indexOf(false);
  if (slot === -1) return; // all workers busy — drop the frame, no harm done
  if (grab.width !== vw || grab.height !== vh) {
    grab.width = vw;
    grab.height = vh;
  }
  const ctx = grab.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(video, 0, 0);
  const img = ctx.getImageData(0, 0, vw, vh);
  busy[slot] = true;
  workers[slot]!.postMessage({ id: frameId++, buf: img.data.buffer, w: vw, h: vh }, [
    img.data.buffer,
  ]);
}

function onDecoded(bytes: Uint8Array) {
  decodeTimes.push(performance.now());
  const parsed = parseFrame(bytes);
  if (!parsed || done) return;
  const { header, block } = parsed;
  if (!decoder || sessionId !== header.sessionId) {
    decoder = new LTDecoder(header.k, header.blockLen, header.sessionId, header.totalLen);
    sessionId = header.sessionId;
    startTs = performance.now();
  }
  decoder.addFrame(header.seq, block);
  const progress = Math.min(0.99, decoder.framesNew / (decoder.k * OVERHEAD_EST));
  bar.style.width = `${(progress * 100).toFixed(1)}%`;

  if (decoder.isComplete) {
    const payload = decoder.assemble()!;
    const seconds = (performance.now() - startTs) / 1000;
    const ok = fnv1a(payload) === header.payloadFnv;
    finish(payload, ok, seconds, header.totalLen, parsed.name);
  }
}

/**
 * Name + type hardening: the protocol only carries a name, so the payload's
 * magic bytes are the source of truth for the MIME type, and the saved file
 * name always ends in a real extension — a WAV that arrives as "received"
 * (or legacy frames with no name at all) still saves as .wav.
 */
function resolveFileMeta(payload: Uint8Array, name: string): { fileName: string; mime: string } {
  const sniffed = sniffMime(payload);
  const raw = name || t("receive.noname");
  const mime = sniffed ?? guessMime(raw);
  if (hasExtension(raw)) return { fileName: raw, mime };
  return { fileName: `${raw}.${extForMime(sniffed)}`, mime };
}

function finish(payload: Uint8Array, hashOk: boolean, seconds: number, totalLen: number, name: string) {
  done = true;
  captureGen++;
  stream?.getTracks().forEach((t) => t.stop());
  rxStage.style.display = "none";
  bar.style.width = "100%";
  const { fileName, mime } = resolveFileMeta(payload, name);
  const kb = Math.round(totalLen / 1024);
  const rate = (totalLen / 1024 / seconds).toFixed(1);
  stats.textContent = t("receive.summary", {
    name: fileName,
    kb,
    sec: seconds.toFixed(1),
    rate,
    ok: hashOk ? t("receive.hashOk") : t("receive.hashBad"),
  });
  const heading = document.createElement("div");
  heading.className = "done";
  heading.textContent = t("receive.done");
  result.append(heading);

  const isImage = mime.startsWith("image/");
  if (isImage) {
    const img = document.createElement("img");
    img.className = "received";
    img.src = URL.createObjectURL(new Blob([payload as BlobPart], { type: mime }));
    result.append(img);
  }

  const actions = document.createElement("div");
  actions.className = "actions";
  const dl = document.createElement("button");
  dl.className = "small";
  dl.textContent = t("receive.save");
  dl.onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([payload as BlobPart], { type: mime }));
    a.download = fileName;
    a.click();
  };
  actions.append(dl);

  const file = new File([payload as BlobPart], fileName, { type: mime });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    const share = document.createElement("button");
    share.className = "small";
    share.textContent = t("receive.share");
    share.onclick = () => {
      void navigator.share({ files: [file] }).catch(() => undefined);
    };
    actions.append(share);
  }

  const fwd = document.createElement("button");
  fwd.className = "ghost small";
  fwd.textContent = t("receive.forward");
  fwd.onclick = () => {
    store.pending = { payload, name: fileName, mime };
    location.hash = "#/send";
  };
  actions.append(fwd);
  result.append(actions);
}

function updateStats() {
  if (done) return;
  const now = performance.now();
  const prune = (a: number[]) => {
    while (a.length > 0 && a[0]! < now - 2000) a.shift();
  };
  prune(captureTimes);
  prune(decodeTimes);
  metric("m-cap").textContent = (captureTimes.length / 2).toFixed(0);
  metric("m-dec").textContent = (decodeTimes.length / 2).toFixed(1);
  if (!decoder) return;
  const elapsed = (now - startTs) / 1000;
  const kbs = (decoder.framesNew * decoder.blockLen) / OVERHEAD_EST / 1024 / Math.max(0.1, elapsed);
  metric("m-rate").textContent = `${kbs.toFixed(1)} KB/s`;
  metric("m-time").textContent = `${elapsed.toFixed(0)} s`;
  metric("m-frames").textContent = `${decoder.framesNew}/${decoder.framesDup}`;
  metric("m-k").textContent = String(decoder.k);
  metric("m-block").textContent = `${decoder.blockLen} B`;
  metric("m-payload").textContent = `${Math.round(decoder.totalLen / 1024)} KB`;
}

export function enterReceive() {
  // camera starts only on the user's Start tap — nothing to do here
}

export function exitReceive() {
  captureGen++;
  stream?.getTracks().forEach((t) => t.stop());
  clearInterval(statsTimer);
}
