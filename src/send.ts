// File selection → pixel-aligned QR frames with bounded reads and stable pacing.

import QRCode from "qrcode";
import { LTEncoder } from "../shared/fountain";
import {
  HEADER_LEN,
  NAME_FIELD_LEN,
  fnv1a,
  MAX_TRANSFER_BYTES,
  packFrame,
  type FrameHeader,
} from "../shared/protocol";
import { setTransferActive, store } from "./store";
import { guessMime } from "./util";
import { setText } from "./i18n";
import { ScreenWakeLock } from "./wake-lock";
import { FramePacer } from "./frame-pacer";

const MARGIN = 4; // quiet-zone modules
const LOOKAHEAD = 3;

// Dual-lane mode ("2 codes"): both QRs show the SAME fountain stream, but
// with disjoint seq ranges (lane A: 0…, lane B: LANE_OFFSET…). The receiver
// dedups by seq, so two codes per refresh = two useful frames = 2× speed,
// and a blocked code just leaves the other lane delivering the full stream
// (1× speed, never a stall). No protocol change, no alignment needed.
// 2^31 frames at 60 fps is ~414 days of continuous streaming — far beyond
// any real transfer, so the ranges can never collide.
const LANE_OFFSET = 0x80000000;

const $ = (id: string) => document.getElementById(id)!;
const canvas = $("qr") as HTMLCanvasElement;
const specs = $("specs");
const dropzone = $("dropzone");
const fileInput = $("file-input") as HTMLInputElement;
const photoInput = $("photo-input") as HTMLInputElement;
const fileMeta = $("file-meta");
const fileMetaText = $("file-meta-text");
const fileClear = $("file-clear") as HTMLButtonElement;
const stage = $("stage");
const txActions = $("tx-actions");
const btnStop = $("btn-stop") as HTMLButtonElement;
const btnResend = $("btn-resend") as HTMLButtonElement;
const txProgress = $("tx-progress");
const cfgFps = $("cfg-fps") as HTMLSelectElement;
const cfgBytes = $("cfg-bytes") as HTMLSelectElement;
const cfgEcc = $("cfg-ecc") as HTMLSelectElement;
const cfgSize = $("cfg-size") as HTMLInputElement;
const cfgLanes = $("cfg-lanes") as HTMLSelectElement;

/** Payload bytes per frame after header + name field. */
export function blockLenFor(frameBytes: number): number {
  return frameBytes - HEADER_LEN - 1 - NAME_FIELD_LEN;
}

let generation = 0; // bumped on stop/exit/clear; stale loops and timers die
let pickSeq = 0; // guards against an older file resolve overwriting a newer pick
let active = false;
let entered = false;
const wakeLock = new ScreenWakeLock();
let animationFrame: number | undefined;
let pumpTimer: number | undefined;
let resizeHandler: (() => void) | undefined;
let progressTimer: number | undefined;

const FRAME_PRESETS = [500, 1000, 1465, 1850, 2331, 2953];
const QR_CAPACITY = { L: 2953, M: 2331, Q: 1663, H: 1273 };
function normalizeCapacity(): number {
  const ecc = cfgEcc.value as keyof typeof QR_CAPACITY;
  const capacity = QR_CAPACITY[ecc] ?? QR_CAPACITY.L;
  for (const option of cfgBytes.options)
    option.disabled = Number(option.value) > capacity;
  if (Number(cfgBytes.value) > capacity) {
    cfgBytes.value = String(FRAME_PRESETS.filter((n) => n <= capacity).at(-1));
  }
  return Number(cfgBytes.value);
}

function loadFile(file: File) {
  if (!entered) return;
  haltStream();
  const pick = ++pickSeq;
  const error = sizeError(
    file.size,
    file.name,
    blockLenFor(normalizeCapacity()),
  );
  if (error) {
    clearSelection();
    setText(specs, error.key, error.vars);
    return;
  }
  setTransferActive("send", true);
  void file
    .arrayBuffer()
    .then((buf) => {
      if (pick !== pickSeq || !entered) return;
      const payload = new Uint8Array(buf);
      const sizeIssue = sizeError(
        payload.length,
        file.name,
        blockLenFor(normalizeCapacity()),
      );
      if (sizeIssue) {
        clearSelection();
        setText(specs, sizeIssue.key, sizeIssue.vars);
        return;
      }
      store.pending = {
        payload,
        name: file.name,
        mime: file.type || guessMime(file.name),
      };
      showFileMeta();
      startStream();
    })
    .catch((err: unknown) => {
      if (pick !== pickSeq || !entered) return;
      setTransferActive("send", false);
      setText(specs, "send.readErr", {
        msg: err instanceof Error ? err.message : String(err),
      });
    });
}

function showFileMeta() {
  const p = store.pending;
  if (!p) return;
  const kb = Math.max(1, Math.round(p.payload.length / 1024));
  $("view-send").classList.add("has-file");
  dropzone.hidden = true; // the picker gives way to the picked file card
  fileMeta.hidden = false;
  fileClear.hidden = false;
  fileMetaText.textContent = `${p.name} · ${kb} KB`;
}

function clearSelection() {
  haltStream();
  pickSeq++; // any in-flight file read is now stale
  active = false;
  store.pending = null;
  $("view-send").classList.remove("has-file");
  $("send-paused").hidden = true;
  dropzone.hidden = false; // the picker comes back
  fileMeta.hidden = true;
  stage.hidden = true;
  txActions.hidden = true;
  txProgress.hidden = true;
  txProgress.textContent = "";
  setText(specs, "send.choose");
  clearInterval(progressTimer);
}

function sizeError(
  length: number,
  name: string,
  blockLen: number,
): { key: string; vars?: Record<string, string | number> } | null {
  if (length === 0) return { key: "send.empty" };
  if (length > MAX_TRANSFER_BYTES) return { key: "send.memoryLimit" };
  const k = Math.ceil(length / blockLen);
  if (k > 0xffff) return { key: "send.tooManyBlocks", vars: { name, k } };
  return null;
}

function haltStream() {
  generation++;
  active = false;
  stage.hidden = true;
  $("send-paused").hidden = !store.pending;
  btnStop.hidden = true;
  btnResend.hidden = !store.pending;
  clearInterval(progressTimer);
  clearTimeout(pumpTimer);
  if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
  if (resizeHandler) window.removeEventListener("resize", resizeHandler);
  resizeHandler = undefined;
  wakeLock.setActive(false);
  setTransferActive("send", false);
}

function startStream() {
  haltStream();
  const gen = generation;
  if (!entered) return;
  const p = store.pending;
  if (!p) {
    setText(specs, "send.choose");
    return;
  }
  const payload = p.payload;
  const txFps = Number(cfgFps.value);
  const frameBytes = normalizeCapacity();
  const ecc = cfgEcc.value as "L" | "M" | "Q" | "H";
  const displayPx = Number(cfgSize.value);
  const lanes = cfgLanes.value === "2" ? 2 : 1; // 1 = original single-code mode
  const blockLen = blockLenFor(frameBytes);
  const tooBig = sizeError(payload.length, p.name, blockLen);
  if (tooBig) {
    setText(specs, tooBig.key, tooBig.vars);
    return;
  }
  if (gen !== generation) return; // superseded while checking
  const sessionId = crypto.getRandomValues(new Uint16Array(1))[0]!;
  const name = p.name; // packFrame truncates by bytes, on a code-point boundary
  const encoder = new LTEncoder(payload, blockLen, sessionId);
  const header: FrameHeader = {
    sessionId,
    seq: 0,
    k: encoder.k,
    blockLen,
    totalLen: payload.length,
    payloadFnv: fnv1a(payload),
  };

  let version: number | undefined; // locked after the first frame
  let modules = 0;
  let scale = 1;
  let stack = true; // portrait: codes stacked vertically; landscape: side by side
  const staging = document.createElement("canvas");
  const queue: ImageData[] = [];
  let nextSeq = 0; // lane A seq (0…)
  let nextSeqB = 0; // lane B seq offset from LANE_OFFSET
  let displayedCodes = 0;
  const displayTimes: number[] = [];

  const sizeCanvas = () => {
    const dpr = window.devicePixelRatio || 1;
    const total = modules + 2 * MARGIN;
    const short = Math.min(window.innerWidth, window.innerHeight);
    const long = Math.max(window.innerWidth, window.innerHeight);
    // Keep integer device pixels per module and preserve the QR quiet zone.
    // Respect the responsive panel width for either one or two codes.
    stack = window.innerWidth <= window.innerHeight;
    const parentWidth = stage.parentElement?.clientWidth;
    const available = parentWidth
      ? Math.max(1, (parentWidth - 4) / (stack ? 1 : lanes))
      : 0.9 * short;
    const parentTop = stage.parentElement?.getBoundingClientRect?.().top ?? 0;
    const heightBudget = Math.max(
      1,
      (window.innerHeight - Math.max(0, parentTop) - 24) / (stack ? lanes : 1),
    );
    const cssBudget = Math.min(
      heightBudget,
      0.9 * short,
      available,
      displayPx,
      lanes > 1 ? (0.9 * long) / lanes : Infinity,
    );
    scale = Math.max(1, Math.floor((cssBudget * dpr) / total));
    staging.width = stack ? total : total * lanes;
    staging.height = stack ? total * lanes : total;
    canvas.width = staging.width * scale;
    canvas.height = staging.height * scale;
    canvas.style.width = `${(staging.width * scale) / dpr}px`;
    canvas.style.height = `${(staging.height * scale) / dpr}px`;
  };

  const makeFrame = (seq: number): ImageData => {
    const bytes = packFrame({ ...header, seq }, encoder.encode(seq), name);
    const qr = QRCode.create(
      [{ data: bytes, mode: "byte" } as unknown as QRCode.QRCodeSegment],
      {
        errorCorrectionLevel: ecc,
        version,
        maskPattern: 4,
      },
    );
    if (version === undefined) {
      version = qr.version;
      modules = qr.modules.size;
      sizeCanvas();
      setText(specs, "ui.txSpecs", { lanes, fps: txFps, ecc });
    }
    const size = qr.modules.size;
    const data = qr.modules.data;
    const total = size + 2 * MARGIN;
    const img = new ImageData(total, total);
    const px = new Uint32Array(img.data.buffer);
    px.fill(0xffffffff);
    for (let y = 0; y < size; y++) {
      const row = (y + MARGIN) * total + MARGIN;
      const src = y * size;
      for (let x = 0; x < size; x++) {
        if (data[src + x]) px[row + x] = 0xff000000;
      }
    }
    return img;
  };

  const pump = () => {
    if (gen !== generation) return;
    try {
      while (queue.length < LOOKAHEAD * lanes) {
        queue.push(makeFrame(nextSeq++));
        if (lanes === 2) queue.push(makeFrame(LANE_OFFSET + nextSeqB++));
      }
    } catch (err) {
      haltStream();
      stage.hidden = true;
      btnStop.hidden = true;
      btnResend.hidden = false;
      txActions.hidden = false;
      setText(specs, "send.genErr", {
        msg: err instanceof Error ? err.message : String(err),
      });
    }
  };
  pump();
  if (gen !== generation) return;
  active = true;
  setTransferActive("send", true);
  wakeLock.setActive(true);
  btnStop.hidden = false;
  btnResend.hidden = true;
  stage.hidden = false;
  $("send-paused").hidden = true;
  txActions.hidden = false;
  txProgress.hidden = false;
  txProgress.textContent = "";
  resizeHandler = sizeCanvas;
  window.addEventListener("resize", resizeHandler);

  clearInterval(progressTimer);
  progressTimer = window.setInterval(() => {
    if (gen !== generation) {
      clearInterval(progressTimer);
      return;
    }
    while (displayTimes.length && displayTimes[0]! < performance.now() - 2000)
      displayTimes.shift();
    const span =
      displayTimes.length > 1 ? displayTimes.at(-1)! - displayTimes[0]! : 0;
    const fps =
      span > 0 ? (((displayTimes.length - 1) * 1000) / span).toFixed(1) : "—";
    setText(txProgress, "ui.txProgress", { n: displayedCodes, fps });
  }, 500);

  const pacer = new FramePacer(txFps);
  const tick = (now: number) => {
    if (gen !== generation) return;
    animationFrame = requestAnimationFrame(tick);
    if (!pacer.due(now) || queue.length < lanes) return;
    pumpTimer = window.setTimeout(pump, 0);
    const t = modules + 2 * MARGIN; // per-code pixel size in staging space
    const sctx = staging.getContext("2d")!;
    for (let l = 0; l < lanes; l++) {
      const img = queue.shift()!;
      sctx.putImageData(img, stack ? 0 : l * t, stack ? l * t : 0);
    }
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(staging, 0, 0, canvas.width, canvas.height);
    pacer.displayed(now);
    displayedCodes += lanes;
    displayTimes.push(now);
  };
  animationFrame = requestAnimationFrame(tick);
}

function stopStream() {
  haltStream();
  stage.hidden = true;
  $("send-paused").hidden = !store.pending;
  btnStop.hidden = true;
  btnResend.hidden = false;
  setText(txProgress, "send.stopped");
}

export function enterSend() {
  entered = true;
  normalizeCapacity();
  if (store.pending && !active) {
    showFileMeta();
    void startStream();
  }
}

export function exitSend() {
  entered = false;
  pickSeq++;
  haltStream();
  stage.hidden = true;
}

// ---- wiring ----
btnStop.onclick = stopStream;
btnResend.onclick = () => {
  if (store.pending) void startStream();
};
fileClear.onclick = clearSelection;

fileInput.onchange = () => {
  const f = fileInput.files?.[0];
  if (f) loadFile(f);
  fileInput.value = ""; // allow re-picking the same file
};
photoInput.onchange = () => {
  const f = photoInput.files?.[0];
  if (f) loadFile(f);
  photoInput.value = "";
};
$("btn-file").onclick = () => fileInput.click();
$("btn-photo").onclick = () => photoInput.click();

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("drag");
});
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag"));
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("drag");
  const f = e.dataTransfer?.files?.[0];
  if (f) loadFile(f);
});

for (const el of [cfgFps, cfgBytes, cfgEcc, cfgSize, cfgLanes]) {
  el.addEventListener("change", () => {
    normalizeCapacity();
    if (active && store.pending) void startStream();
  });
}
