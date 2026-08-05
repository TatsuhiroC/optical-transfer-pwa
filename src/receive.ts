// Receive mode: camera → WASM QR decode in workers → fountain decoder → file.
//
// UI follows the qrrec.liuwa.xyz receiver design (the user's reference):
// capability pills (secure context / camera / worker / wasm), camera
// settings, a big gradient start button, an 8-cell metric grid, a compact
// camera preview with a scan guide, and a transfer panel with frame pulses.
//
// Pipeline is unchanged from the original: capture width / fps / worker
// count, `exact` fps demanded first (iOS lies with `ideal`),
// requestVideoFrameCallback with a generation counter against zombie capture
// loops, progress tracking frames COLLECTED (LT peeling back-loads).
//
// Camera robustness fixes over the earlier build: a failed getUserMedia no
// longer swallows the controls — settings and the start button come back, the
// camera pill flips to fail with the reason, and a permission denial gets its
// own message. Re-entering the view resets `done` so a second transfer works.

import { LTDecoder } from "../shared/fountain";
import { fnv1a, parseFrame } from "../shared/protocol";
import { store } from "./store";
import { guessMime, sniffMime, hasExtension, extForMime } from "./util";
import { t } from "./i18n";

const OVERHEAD_EST = 1.18; // expected frames ≈ K × this (robust-soliton ε)

const $ = (id: string) => document.getElementById(id)!;
const startBtn = $("start") as HTMLButtonElement;
const video = $("video") as HTMLVideoElement;
const preview = $("preview");
const stats = $("stats");
const progressEl = $("progress");
const bar = $("bar");
const progressFrames = $("progress-frames");
const progressPercent = $("progress-percent");
const result = $("result");
const settings = $("settings") as HTMLDetailsElement;
const metricsEl = $("metrics");
const restartBtn = $("restart") as HTMLButtonElement;
const metric = (id: string) => $(id);
const pulses = [...$("frame-pulses").children] as HTMLElement[];

let pulseIdx = 0;
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

function capSet(id: string, state: "pass" | "fail" | "", text: string) {
  const el = $(id);
  el.classList.remove("pass", "fail");
  if (state) el.classList.add(state);
  const b = el.querySelector("b");
  if (b) b.textContent = text;
}

startBtn.onclick = () => void start();

async function start() {
  const secure = window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;
  if (!secure) {
    capSet("cap-secure", "fail", t("receive.capFail"));
    stats.textContent = t("receive.secure");
    return;
  }
  capSet("cap-secure", "pass", t("receive.capPass"));
  const captureWidth = Number(($("cfg-width") as HTMLSelectElement).value);
  const captureFps = Number(($("cfg-capfps") as HTMLSelectElement).value);
  const workerCount = Number(($("cfg-workers") as HTMLSelectElement).value);
  settings.style.display = "none";
  startBtn.style.display = "none";
  preview.style.display = "block";
  metricsEl.style.display = "grid";
  progressEl.style.display = "block";
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
    // Camera failed — bring the controls back so the user can retry (e.g.
    // after granting permission in settings), and say why.
    settings.style.display = "";
    startBtn.style.display = "";
    preview.style.display = "none";
    metricsEl.style.display = "none";
    progressEl.style.display = "none";
    capSet("cap-camera", "fail", t("receive.capFail"));
    const denied =
      err instanceof DOMException &&
      (err.name === "NotAllowedError" || err.name === "PermissionDeniedError");
    stats.textContent = denied
      ? t("receive.camDenied")
      : t("receive.camErr", { msg: err instanceof Error ? err.message : String(err) });
    return;
  }
  capSet("cap-camera", "pass", t("receive.capPass"));
  video.srcObject = stream;
  await video.play().catch(() => undefined);
  stats.textContent = t("receive.searching");
  restartBtn.style.display = "block"; // restart is available while scanning

  // tear down any workers from a previous session, then spin up fresh ones
  for (const w of workers) w.terminate();
  workers.length = 0;
  busy.length = 0;
  for (let i = 0; i < workerCount; i++) {
    const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    const slot = i;
    w.onmessage = (e: MessageEvent) => {
      const { id, bytes } = e.data as { id: number; bytes: Uint8Array[] };
      if (id === -1) {
        capSet("cap-wasm", "pass", t("receive.capPass"));
        return; // warm-up
      }
      busy[slot] = false;
      // Dual-lane senders deliver two codes per camera frame; both belong
      // to the same fountain stream (disjoint seq ranges), so the decoder
      // dedups and both count as progress.
      for (const b of bytes) onDecoded(b);
    };
    workers.push(w);
    busy.push(false);
  }
  capSet("cap-worker", "pass", t("receive.capPass"));

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

/** Light one of the 24 pulse dots per fresh frame (ring buffer). */
function pulse() {
  const p = pulses[pulseIdx % pulses.length];
  pulseIdx++;
  if (p) {
    p.classList.remove("active");
    void p.offsetWidth; // restart the CSS transition
    p.classList.add("active");
  }
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
    pulseIdx = 0;
  }
  decoder.addFrame(header.seq, block);
  pulse();
  const target = Math.ceil(decoder.k * OVERHEAD_EST);
  const progress = Math.min(0.99, decoder.framesNew / target);
  bar.style.width = `${(progress * 100).toFixed(1)}%`;
  progressPercent.textContent = `${(progress * 100).toFixed(0)}%`;
  progressFrames.textContent = `${decoder.framesNew} / ${target} ${t("receive.framesSuffix")}`;

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
  preview.style.display = "none";
  bar.style.width = "100%";
  progressPercent.textContent = "100%";
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

  const dl = document.createElement("button");
  dl.className = "download-button";
  dl.textContent = t("receive.save");
  dl.onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([payload as BlobPart], { type: mime }));
    a.download = fileName;
    a.click();
  };
  result.append(dl);

  const file = new File([payload as BlobPart], fileName, { type: mime });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    const share = document.createElement("button");
    share.className = "secondary-button";
    share.textContent = t("receive.share");
    share.onclick = () => {
      void navigator.share({ files: [file] }).catch(() => undefined);
    };
    result.append(share);
  }

  const fwd = document.createElement("button");
  fwd.className = "secondary-button";
  fwd.textContent = t("receive.forward");
  fwd.onclick = () => {
    store.pending = { payload, name: fileName, mime };
    location.hash = "#/send";
  };
  result.append(fwd);
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

/** Back to the very start: stop the camera + capture loop, drop the
 * decoder state, clear the result area, restore settings/start and the
 * capability pills. Used by re-entering the view AND by the restart
 * button (both while scanning and after a completed transfer). */
function resetReceive() {
  done = false;
  captureGen++;
  stream?.getTracks().forEach((t) => t.stop());
  clearInterval(statsTimer);
  decoder = null;
  sessionId = 0;
  pulseIdx = 0;
  result.innerHTML = "";
  bar.style.width = "0%";
  progressPercent.textContent = "0%";
  progressFrames.textContent = `0 / 0 ${t("receive.framesSuffix")}`;
  progressEl.style.display = "none";
  preview.style.display = "none";
  metricsEl.style.display = "none";
  restartBtn.style.display = "none";
  settings.style.display = "";
  startBtn.style.display = "";
  capSet("cap-camera", "", t("receive.capPendingCam"));
  capSet("cap-worker", "", t("receive.capPending"));
  capSet("cap-wasm", "", t("receive.capPending"));
  capSet("cap-secure", window.isSecureContext ? "pass" : "fail", window.isSecureContext ? t("receive.capPass") : t("receive.capFail"));
  stats.textContent = t("receive.stats");
}

restartBtn.onclick = resetReceive;

export function enterReceive() {
  resetReceive();
}

export function exitReceive() {
  captureGen++;
  stream?.getTracks().forEach((t) => t.stop());
  clearInterval(statsTimer);
}
