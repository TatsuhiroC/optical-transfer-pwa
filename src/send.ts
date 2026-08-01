// Send mode: pick a local file (or one handed over from a received transfer)
// and stream it as an endless fountain-coded QR animation.
//
// Same pipeline as the original sender: mask pattern pinned (4x faster QR
// generation), each frame shown for >= 2 refresh cycles, ECC L by default —
// the fountain layer already turns corruption into erasures. On top of the
// original this mode adds local file selection (any file, photo album, or
// drag & drop), a file name field in every frame, size checks against the
// protocol ceiling (k is u16 -> ~65535 blocks), a live frame/time estimate,
// and a "remove file" (×) control so the picker stays visible and the user
// can clear the selection and choose again. Exactly one file at a time.

import QRCode from "qrcode";
import { LTEncoder } from "../shared/fountain";
import {
  HEADER_LEN,
  NAME_FIELD_LEN,
  NAME_MAX,
  fnv1a,
  packFrame,
  type FrameHeader,
} from "../shared/protocol";
import { store, type PendingFile } from "./store";
import { guessMime } from "./util";
import { t } from "./i18n";

const OVERHEAD_EST = 1.18; // expected frames ≈ K × this (robust-soliton ε)
const MARGIN = 4; // quiet-zone modules
const LOOKAHEAD = 3;

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

/** Payload bytes per frame after header + name field. */
export function blockLenFor(frameBytes: number): number {
  return frameBytes - HEADER_LEN - 1 - NAME_FIELD_LEN;
}

let generation = 0; // bumped on stop/exit/clear; stale loops and timers die
let pickSeq = 0; // guards against an older file resolve overwriting a newer pick
let active = false;
let progressTimer: number | undefined;

function loadFile(file: File) {
  const pick = ++pickSeq;
  void file.arrayBuffer().then((buf) => {
    if (pick !== pickSeq) return; // superseded by a newer pick or a clear
    const payload = new Uint8Array(buf);
    store.pending = { payload, name: file.name, mime: file.type || guessMime(file.name) };
    showFileMeta();
    void startStream();
  });
}

function showFileMeta() {
  const p = store.pending;
  if (!p) return;
  const kb = Math.max(1, Math.round(p.payload.length / 1024));
  dropzone.hidden = true; // the picker gives way to the picked file card
  fileMeta.hidden = false;
  fileClear.hidden = false;
  fileMetaText.textContent = `${p.name} · ${kb} KB · ${p.mime}`;
}

function clearSelection() {
  generation++;
  pickSeq++; // any in-flight file read is now stale
  active = false;
  store.pending = null;
  dropzone.hidden = false; // the picker comes back
  fileMeta.hidden = true;
  stage.hidden = true;
  txActions.hidden = true;
  txProgress.hidden = true;
  txProgress.textContent = "";
  specs.textContent = t("send.choose");
  clearInterval(progressTimer);
}

function sizeError(p: PendingFile, blockLen: number, k: number): string | null {
  if (p.payload.length > 0xffffffff) return t("send.tooLarge");
  if (k > 0xffff) return t("send.tooManyBlocks", { name: p.name, k });
  return null;
}

async function startStream() {
  const gen = ++generation;
  const p = store.pending;
  if (!p) {
    specs.textContent = t("send.choose");
    return;
  }
  const payload = p.payload;
  const txFps = Number(cfgFps.value);
  const frameBytes = Number(cfgBytes.value);
  const ecc = cfgEcc.value as "L" | "M" | "Q" | "H";
  const displayPx = Number(cfgSize.value);
  const blockLen = blockLenFor(frameBytes);
  const k = Math.ceil(payload.length / blockLen);
  const tooBig = sizeError(p, blockLen, k);
  if (tooBig) {
    specs.textContent = tooBig;
    return;
  }
  if (gen !== generation) return; // superseded while checking
  active = true;
  btnStop.hidden = false;
  btnResend.hidden = true;
  stage.hidden = false;
  txActions.hidden = false;
  txProgress.hidden = false;

  const sessionId = (Math.floor(Math.random() * 0xffff) + 1) & 0xffff;
  const name = p.name.length > NAME_MAX ? p.name.slice(0, NAME_MAX) : p.name;
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
  const staging = document.createElement("canvas");
  const queue: ImageData[] = [];
  let nextSeq = 0;

  const sizeCanvas = () => {
    const dpr = window.devicePixelRatio || 1;
    const total = modules + 2 * MARGIN;
    const cssBudget = Math.min(0.9 * Math.min(window.innerWidth, window.innerHeight), displayPx);
    scale = Math.max(1, Math.floor((cssBudget * dpr) / total));
    staging.width = total;
    staging.height = total;
    canvas.width = total * scale;
    canvas.height = total * scale;
    canvas.style.width = `${(total * scale) / dpr}px`;
    canvas.style.height = `${(total * scale) / dpr}px`;
  };

  const makeFrame = (): ImageData => {
    const bytes = packFrame({ ...header, seq: nextSeq }, encoder.encode(nextSeq), name);
    nextSeq++;
    const qr = QRCode.create([{ data: bytes, mode: "byte" } as unknown as QRCode.QRCodeSegment], {
      errorCorrectionLevel: ecc,
      version,
      maskPattern: 4,
    });
    if (version === undefined) {
      version = qr.version;
      modules = qr.modules.size;
      sizeCanvas();
      const est = Math.ceil(k * OVERHEAD_EST);
      specs.textContent =
        `${p.name} · ${Math.round(payload.length / 1024)} KB · K=${k} · ~${est} frames · ` +
        `~${Math.ceil(est / txFps)} s @${txFps}fps · ${frameBytes} B/frame · V${version} · ECC ${ecc}`;
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
      while (queue.length < LOOKAHEAD) queue.push(makeFrame());
    } catch (err) {
      specs.textContent = t("send.genErr", { msg: err instanceof Error ? err.message : String(err) });
      return;
    }
    setTimeout(pump, 0);
  };
  pump();

  clearInterval(progressTimer);
  progressTimer = window.setInterval(() => {
    if (gen !== generation) {
      clearInterval(progressTimer);
      return;
    }
    const est = Math.ceil(k * OVERHEAD_EST);
    txProgress.textContent = t("send.progress", { n: nextSeq, m: est });
  }, 500);

  const interval = 1000 / txFps;
  let nextAt = performance.now();
  const tick = (now: number) => {
    if (gen !== generation) return;
    requestAnimationFrame(tick);
    if (now < nextAt) return;
    const img = queue.shift();
    if (!img) {
      nextAt = now + interval;
      return;
    }
    staging.getContext("2d")!.putImageData(img, 0, 0);
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(staging, 0, 0, canvas.width, canvas.height);
    nextAt += interval;
    if (now - nextAt > 3 * interval) nextAt = now + interval; // fell behind — don't burst
  };
  requestAnimationFrame(tick);
  try {
    await (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<unknown> } })
      .wakeLock?.request("screen");
  } catch {
    /* fine without it */
  }
}

function stopStream() {
  generation++;
  active = false;
  btnStop.hidden = true;
  btnResend.hidden = false;
  txProgress.textContent = t("send.stopped");
}

export function enterSend() {
  if (store.pending && !active) {
    showFileMeta();
    void startStream();
  }
}

export function exitSend() {
  generation++;
  active = false;
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

for (const el of [cfgFps, cfgBytes, cfgEcc, cfgSize]) {
  el.addEventListener("change", () => {
    if (active && store.pending) void startStream();
  });
}
