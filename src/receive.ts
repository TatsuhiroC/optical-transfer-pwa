// Camera → worker decoding → integrity-checked file, with lightweight state feedback.

import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { DecodeLimitError, LTDecoder } from "../shared/fountain";
import {
  fnv1a,
  headerReject,
  MAX_TRANSFER_BYTES,
  parseFrame,
  type FrameHeader,
} from "../shared/protocol";
import { setTransferActive, store } from "./store";
import { ScreenWakeLock } from "./wake-lock";
import { guessMime, sniffMime, hasExtension, extForMime } from "./util";
import { t, setText } from "./i18n";

type ReceivePhase =
  | "ready"
  | "starting"
  | "searching"
  | "receiving"
  | "waiting"
  | "verifying"
  | "complete"
  | "error";
let receivePhase: ReceivePhase | null = null;
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
let session: { header: FrameHeader; name: string } | null = null;
let entered = false;
let running = false;
let starting = false;
let lastFrameTs = 0;
const wakeLock = new ScreenWakeLock();
const previewUrls = new Set<string>();
const workerTimers: number[] = [];
let startTs = 0;
let captureGen = 0;
let done = false;
let statsTimer: number | undefined;
let progressDirty = false;
let freshSinceRender = 0;
let captureCount = 0;
let busyDrops = 0;
let trackRegion = true;

const workers: Worker[] = [];
const busy: boolean[] = [];
const captureTimes: number[] = [];
const decodeTimes: number[] = [];
const scanSamples: { at: number; ms: number }[] = [];

function capSet(id: string, state: "pass" | "fail" | "", key: string) {
  const el = $(id);
  el.classList.remove("pass", "fail");
  if (state) el.classList.add(state);
  const b = el.querySelector("b");
  if (b) setText(b, key);
}

/** State feedback changes once per transition, never per captured frame. */
function showPhase(next: ReceivePhase) {
  if (receivePhase === next) return;
  receivePhase = next;
  const view = $("view-receive");
  const active = ["searching", "receiving", "waiting", "verifying"].includes(
    next,
  );
  view.classList.toggle("rx-active", active);
  view.classList.toggle("rx-complete", next === "complete");
  view.classList.toggle("rx-receiving", next === "receiving");
  view.classList.toggle("rx-waiting", next === "waiting");
  $("rx-session-heading").hidden = !active;
  const key = {
    ready: "ui.rxReady",
    starting: "ui.rxStarting",
    searching: "ui.rxSearching",
    receiving: "ui.rxReceiving",
    waiting: "ui.rxWaiting",
    verifying: "ui.rxVerifying",
    complete: "ui.rxComplete",
    error: "ui.rxError",
  }[next];
  setText($("rx-state"), key);
  setText($("rx-title"), key);
  $("rx-state").classList.toggle(
    "good",
    next === "receiving" || next === "complete",
  );
  $("rx-state").classList.toggle("wait", next === "waiting");
  $("rx-state").classList.toggle("error", next === "error");
  setText(
    $("rx-guidance"),
    next === "waiting"
      ? "ui.waitHint"
      : next === "receiving"
        ? "ui.codeRecognizedCollectingFileData"
        : next === "searching"
          ? "ui.keepTheEntireCodeInsideThe"
          : "receive.settingsHint",
  );
}

startBtn.onclick = () => void start();

function stopCapture() {
  captureGen++;
  running = false;
  starting = false;
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  video.srcObject = null;
  for (const w of workers) w.terminate();
  workers.length = 0;
  busy.length = 0;
  for (const timer of workerTimers) clearTimeout(timer);
  workerTimers.length = 0;
  clearInterval(statsTimer);
  wakeLock.setActive(false);
  setTransferActive("receive", false);
}

function failReceive(key: string) {
  stopCapture();
  done = true;
  decoder = null;
  session = null;
  preview.style.display = "none";
  showPhase("error");
  setText(stats, key);
  progressEl.style.display = "none";
  metricsEl.style.display = "none";
  restartBtn.style.display = "block";
}

async function start() {
  if (!entered || running || starting) return;
  const secure =
    window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;
  if (!secure) {
    capSet("cap-secure", "fail", "receive.capFail");
    showPhase("error");
    setText(stats, "receive.secure");
    return;
  }
  const gen = ++captureGen;
  starting = true;
  showPhase("starting");
  setTransferActive("receive", true);
  capSet("cap-secure", "pass", "receive.capPass");
  const captureWidth = Number(($("cfg-width") as HTMLSelectElement).value);
  const captureFps = Number(($("cfg-capfps") as HTMLSelectElement).value);
  const workerCount = Number(($("cfg-workers") as HTMLSelectElement).value);
  trackRegion = ($("cfg-track") as HTMLInputElement).checked !== false;
  settings.style.display = "none";
  startBtn.style.display = "none";
  restartBtn.style.display = "block";
  const base: MediaTrackConstraints = {
    facingMode: "environment",
    width: { ideal: captureWidth },
    height: { ideal: Math.round((captureWidth * 3) / 4) },
  };
  try {
    let granted: MediaStream;
    try {
      granted = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { ...base, frameRate: { exact: captureFps } },
      });
    } catch (err) {
      if (gen !== captureGen || !entered) return;
      if (!(err instanceof DOMException && err.name === "OverconstrainedError"))
        throw err;
      granted = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { ...base, frameRate: { ideal: captureFps } },
      });
    }
    if (gen !== captureGen || !entered) {
      granted.getTracks().forEach((track) => track.stop());
      return;
    }
    stream = granted;
    video.srcObject = granted;
    await video.play();
    if (gen !== captureGen || !entered) return;
    running = true;
    starting = false;
    capSet("cap-camera", "pass", "receive.capPass");
    showPhase("searching");
    setText(stats, "receive.searching");
    preview.style.display = "block";
    metricsEl.style.display = "grid";
    progressEl.style.display = "block";
    for (let i = 0; i < workerCount; i++) {
      const w = new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
      });
      const slot = i;
      const armTimeout = () => {
        clearTimeout(workerTimers[slot]);
        workerTimers[slot] = window.setTimeout(() => {
          if (gen === captureGen && running) failReceive("receive.workerErr");
        }, 15000);
      };
      w.onmessage = (e: MessageEvent) => {
        if (gen !== captureGen || !running || done) return;
        const { id, bytes, ok, scanMs } = e.data as {
          id: number;
          bytes?: Uint8Array[] | null;
          ok?: boolean;
          scanMs?: number;
        };
        clearTimeout(workerTimers[slot]);
        if (id === -1) {
          if (!ok) {
            failReceive("receive.workerErr");
            return;
          }
          capSet("cap-wasm", "pass", "receive.capPass");
        }
        if (id !== -1 && Number.isFinite(scanMs) && scanMs! >= 0) {
          scanSamples.push({ at: performance.now(), ms: scanMs! });
        }
        busy[slot] = false;
        for (const b of bytes ?? []) {
          if (gen !== captureGen || !running) break;
          onDecoded(b);
        }
      };
      w.onerror = w.onmessageerror = () => {
        if (gen === captureGen && running) failReceive("receive.workerErr");
      };
      workers.push(w);
      busy.push(true); // do not send capture buffers until WASM reports ready
      armTimeout();
    }
    capSet("cap-worker", "pass", "receive.capPass");
    scheduleFrame(gen);
    statsTimer = window.setInterval(updateStats, 200);
    wakeLock.setActive(true);
  } catch (err) {
    if (gen !== captureGen || !entered) return;
    stopCapture();
    settings.style.display = "";
    startBtn.style.display = "";
    preview.style.display = "none";
    metricsEl.style.display = "none";
    progressEl.style.display = "none";
    restartBtn.style.display = "none";
    capSet("cap-camera", "fail", "receive.capFail");
    const denied =
      err instanceof DOMException &&
      (err.name === "NotAllowedError" || err.name === "PermissionDeniedError");
    showPhase("error");
    setText(stats, denied ? "receive.camDenied" : "receive.camErr", {
      msg: err instanceof Error ? err.message : String(err),
    });
  }
}

type VideoRVFC = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
};

function scheduleFrame(gen: number) {
  if (done || gen !== captureGen) return;
  const v = video as VideoRVFC;
  const next = () => {
    if (done || gen !== captureGen) return;
    try {
      captureFrame();
    } catch {
      failReceive("receive.workerErr");
    }
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
  captureCount++;
  const slot = busy.indexOf(false);
  if (slot === -1) {
    busyDrops++;
    return;
  } // bounded queue; fountain tolerates missed frames
  if (grab.width !== vw || grab.height !== vh) {
    grab.width = vw;
    grab.height = vh;
  }
  const ctx = grab.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(video, 0, 0);
  const img = ctx.getImageData(0, 0, vw, vh);
  busy[slot] = true;
  clearTimeout(workerTimers[slot]);
  const gen = captureGen;
  workerTimers[slot] = window.setTimeout(() => {
    if (gen === captureGen && running) failReceive("receive.workerErr");
  }, 15000);
  workers[slot]!.postMessage(
    { id: frameId++, buf: img.data.buffer, w: vw, h: vh, track: trackRegion },
    [img.data.buffer],
  );
}

/** Batch visual progress at 5 Hz, without forcing layout on the camera path. */
function renderProgress() {
  if (!progressDirty || !decoder) return;
  progressDirty = false;
  const target = Math.ceil(decoder.k * OVERHEAD_EST);
  const progress = Math.min(0.99, decoder.framesNew / target);
  bar.style.width = `${(progress * 100).toFixed(1)}%`;
  progressPercent.textContent = `${(progress * 100).toFixed(0)}%`;
  setText(progressFrames, "ui.progressFrames", {
    n: decoder.framesNew,
    m: target,
  });
  if (pulses.length) {
    const end = pulseIdx % pulses.length;
    const lit = Math.min(freshSinceRender, pulses.length);
    pulses.forEach((p, i) =>
      p.classList.toggle(
        "active",
        (end - 1 - i + pulses.length) % pulses.length < lit,
      ),
    );
  }
  freshSinceRender = 0;
}

function showRxFile(name: string, totalLen: number) {
  if (name) $("rx-file").textContent = safeName(name);
  else setText($("rx-file"), "receive.noname");
  $("rx-size").textContent = `${Math.round(totalLen / 1024)} KB`;
}

function onDecoded(bytes: Uint8Array) {
  decodeTimes.push(performance.now());
  const parsed = parseFrame(bytes);
  if (!parsed || done || !running) return;
  const { header, block } = parsed;
  const reject = headerReject(header);
  if (reject) {
    // Trustworthy streams never land here (see headerReject). Say it once so a
    // user pointing at a crafted or corrupt sender is not left guessing.
    if (stats.textContent !== t("receive.badStream")) {
      setText(stats, "receive.badStream");
    }
    return;
  }
  if (header.totalLen > MAX_TRANSFER_BYTES) {
    failReceive("receive.limit");
    return;
  }
  if (!decoder || session?.header.sessionId !== header.sessionId) {
    decoder = new LTDecoder(
      header.k,
      header.blockLen,
      header.sessionId,
      header.totalLen,
    );
    session = { header: { ...header }, name: parsed.name };
    startTs = performance.now();
    lastFrameTs = startTs;
    pulseIdx = 0;
    freshSinceRender = 0;
    showRxFile(session.name, header.totalLen);
  } else {
    const first = session.header;
    if (
      first.k !== header.k ||
      first.blockLen !== header.blockLen ||
      first.totalLen !== header.totalLen ||
      first.payloadFnv !== header.payloadFnv ||
      (session.name && parsed.name && session.name !== parsed.name)
    ) {
      setText(stats, "receive.badStream");
      return;
    }
    if (!session.name && parsed.name) {
      session.name = parsed.name;
      showRxFile(session.name, session.header.totalLen);
    }
  }
  const previous = decoder.framesNew;
  try {
    decoder.addFrame(header.seq, block);
  } catch (err) {
    failReceive(
      err instanceof DecodeLimitError ? "receive.limit" : "receive.badStream",
    );
    return;
  }
  if (decoder.framesNew > previous) {
    lastFrameTs = performance.now();
    if (stats.textContent) stats.textContent = "";
    showPhase("receiving");

    pulseIdx++;
    freshSinceRender++;
    progressDirty = true;
  }

  if (decoder.isComplete) {
    showPhase("verifying");
    const payload = decoder.assemble()!;
    const seconds = (performance.now() - startTs) / 1000;
    if (fnv1a(payload) !== session!.header.payloadFnv) {
      failReceive("receive.hashFailed");
      return;
    }
    finish(payload, seconds, session!.header.totalLen, session!.name);
  }
}

/**
 * Name + type hardening: the protocol only carries a name, so the payload's
 * magic bytes are the source of truth for the MIME type, and the saved file
 * name always ends in a real extension — a WAV that arrives as "received"
 * (or legacy frames with no name at all) still saves as .wav.
 *
 * The name itself is untrusted (anyone with a screen can transmit): strip path
 * separators, control bytes and bidi overrides, which can make the displayed
 * name read differently from the saved one, before it reaches the download
 * attribute, the share sheet or the "send onward" relay.
 */
function safeName(raw: string): string {
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069/\\]/g, "_")
    .slice(0, 120)
    .trim();
  return /^[.\s]*$/.test(cleaned) ? t("receive.noname") : cleaned;
}

function resolveFileMeta(
  payload: Uint8Array,
  name: string,
): { fileName: string; mime: string } {
  const sniffed = sniffMime(payload);
  const raw = safeName(name);
  const mime = sniffed ?? guessMime(raw);
  if (hasExtension(raw)) return { fileName: raw, mime };
  return { fileName: `${raw}.${extForMime(sniffed)}`, mime };
}

/** Base64 for the Filesystem bridge, chunked so a large payload cannot blow the argument stack. */
function payloadToBase64(payload: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < payload.length; i += chunk) {
    binary += String.fromCharCode(...payload.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Save the payload where the platform can actually keep it. On the web that is a
 * blob download; inside the Android shell the WebView has no download handler at
 * all — clicking a download link there just fires a useless navigation to the
 * blob — so the file goes through the Capacitor Filesystem plugin instead.
 */
async function savePayload(
  payload: Uint8Array,
  fileName: string,
  mime = "application/octet-stream",
): Promise<string> {
  if (!Capacitor.isNativePlatform()) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([payload as BlobPart], { type: mime }),
    );
    a.download = fileName;
    a.click();
    const url = a.href;
    // Let the browser consume the download before releasing its Blob.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return fileName;
  }
  await Filesystem.writeFile({
    path: fileName,
    directory: Directory.Documents,
    data: payloadToBase64(payload),
    recursive: true,
  });
  const { uri } = await Filesystem.getUri({
    path: fileName,
    directory: Directory.Documents,
  });
  return uri;
}

/** Hand the payload to the system share sheet (Android has no navigator.share in a WebView). */
async function sharePayload(
  payload: Uint8Array,
  fileName: string,
): Promise<void> {
  // Shares do not overwrite a user's saved document; FileProvider permits Cache.
  const path = `${crypto.randomUUID()}-${fileName}`;
  await Filesystem.writeFile({
    path,
    directory: Directory.Cache,
    data: payloadToBase64(payload),
  });
  try {
    const { uri } = await Filesystem.getUri({
      path,
      directory: Directory.Cache,
    });
    await Share.share({ title: fileName, files: [uri] });
  } catch (err) {
    if (
      !(
        err instanceof Error &&
        /^(Share canceled|Share cancelled)$/.test(err.message)
      )
    )
      throw err;
  } finally {
    await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(
      () => undefined,
    );
  }
}

function finish(
  payload: Uint8Array,
  seconds: number,
  totalLen: number,
  name: string,
) {
  done = true;
  stopCapture();
  decoder = null;
  session = null;
  const resultGen = captureGen;
  showPhase("complete");
  result.hidden = false;
  preview.style.display = "none";
  bar.style.width = "100%";
  progressPercent.textContent = "100%";
  const { fileName, mime } = resolveFileMeta(payload, name);
  const kb = Math.round(totalLen / 1024);
  const rate = (totalLen / 1024 / seconds).toFixed(1);
  setText(stats, "receive.summary", {
    name: fileName,
    kb,
    sec: seconds.toFixed(1),
    rate,
    ok: t("receive.hashOk"),
  });
  const icon = document.createElement("div");
  icon.className = "success-icon";
  icon.innerHTML =
    '<svg viewBox="0 0 28 28" aria-hidden="true"><path d="m6 14 5 5 11-12"/></svg>';
  result.append(icon);
  const heading = document.createElement("h2");
  heading.className = "done";
  setText(heading, "receive.done");
  result.append(heading);
  const verified = document.createElement("span");
  verified.className = "verified";
  setText(verified, "ui.verified");
  result.append(verified);
  const fileLabel = document.createElement("p");
  fileLabel.className = "received-name";
  fileLabel.textContent = `${fileName} · ${kb} KB`;
  result.append(fileLabel);

  const isImage = mime.startsWith("image/");
  if (isImage) {
    const img = document.createElement("img");
    img.className = "received";
    img.src = URL.createObjectURL(
      new Blob([payload as BlobPart], { type: mime }),
    );
    previewUrls.add(img.src);
    result.append(img);
  }

  const dl = document.createElement("button");
  dl.className = "download-button";
  setText(dl, "receive.save");
  dl.onclick = () => {
    dl.disabled = true;
    setText(dl, "receive.saving");
    savePayload(payload, fileName, mime)
      .then((where) => {
        if (resultGen !== captureGen || !entered) return;
        setText(stats, "receive.saved", { path: where });
      })
      .catch((err: unknown) => {
        if (resultGen !== captureGen || !entered) return;
        setText(stats, "receive.saveErr", {
          msg: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => {
        dl.disabled = false;
        setText(dl, "receive.save");
      });
  };
  result.append(dl);

  const file = new File([payload as BlobPart], fileName, { type: mime });
  const nativeShell = Capacitor.isNativePlatform();
  if (
    nativeShell ||
    (navigator.share && navigator.canShare?.({ files: [file] }))
  ) {
    const share = document.createElement("button");
    share.className = "secondary-button share-button";
    result.classList.add("has-share");
    setText(share, "receive.share");
    share.onclick = () => {
      if (!nativeShell) {
        void navigator.share({ files: [file] }).catch(() => undefined);
        return;
      }
      share.disabled = true;
      void sharePayload(payload, fileName)
        .catch((err: unknown) => {
          if (resultGen !== captureGen || !entered) return;
          setText(stats, "receive.saveErr", {
            msg: err instanceof Error ? err.message : String(err),
          });
        })
        .finally(() => {
          share.disabled = false;
        });
    };
    result.append(share);
  }

  const fwd = document.createElement("button");
  fwd.className = "secondary-button forward-button";
  setText(fwd, "receive.forward");
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
  while (scanSamples.length && scanSamples[0]!.at < now - 2000)
    scanSamples.shift();
  metric("m-cap").textContent = (captureTimes.length / 2).toFixed(0);
  metric("m-dec").textContent = (decodeTimes.length / 2).toFixed(1);
  metric("m-scan").textContent = scanSamples.length
    ? `${(scanSamples.reduce((sum, s) => sum + s.ms, 0) / scanSamples.length).toFixed(1)} ms`
    : "—";
  metric("m-dropped").textContent = captureCount
    ? `${((busyDrops / captureCount) * 100).toFixed(0)}%`
    : "—";
  if (!decoder) return;
  renderProgress();
  showPhase(now - lastFrameTs > 1500 ? "waiting" : "receiving");
  if (now - lastFrameTs > 60000) {
    failReceive("receive.stalled");
    return;
  }
  const elapsed = (now - startTs) / 1000;
  const kbs =
    (decoder.framesNew * decoder.blockLen) /
    OVERHEAD_EST /
    1024 /
    Math.max(0.1, elapsed);
  metric("m-rate").textContent =
    `${(receivePhase === "waiting" ? 0 : kbs).toFixed(1)} KB/s`;
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
  stopCapture();
  showPhase("ready");
  decoder = null;
  session = null;
  for (const url of previewUrls) URL.revokeObjectURL(url);
  previewUrls.clear();
  captureTimes.length = 0;
  decodeTimes.length = 0;
  scanSamples.length = 0;
  captureCount = 0;
  busyDrops = 0;
  frameId = 0;
  progressDirty = false;
  freshSinceRender = 0;
  pulseIdx = 0;
  pulses.forEach((p) => p.classList.remove("active"));
  result.innerHTML = "";
  result.hidden = true;
  result.classList.remove("has-share");
  setText($("rx-file"), "ui.waitingForAFile");
  $("rx-size").textContent = "";
  metric("m-rate").textContent = "—";
  metric("m-time").textContent = "—";
  bar.style.width = "0%";
  progressPercent.textContent = "0%";
  setText(progressFrames, "ui.progressFrames", { n: 0, m: 0 });
  progressEl.style.display = "none";
  preview.style.display = "none";
  metricsEl.style.display = "none";
  restartBtn.style.display = "none";
  settings.style.display = "";
  startBtn.style.display = "";
  capSet("cap-camera", "", "receive.capPendingCam");
  capSet("cap-worker", "", "receive.capPending");
  capSet("cap-wasm", "", "receive.capPending");
  capSet(
    "cap-secure",
    window.isSecureContext ? "pass" : "fail",
    window.isSecureContext ? "receive.capPass" : "receive.capFail",
  );
  setText(stats, "receive.stats");
}

restartBtn.onclick = resetReceive;

export function enterReceive() {
  entered = true;
  resetReceive();
}

export function exitReceive() {
  entered = false;
  resetReceive();
}
