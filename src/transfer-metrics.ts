/** Display units follow the app's existing 1024-byte size convention. */
export function formatBytes(bytes: number): string {
  const size = Number.isFinite(bytes) ? Math.max(0, bytes) : 0;
  if (size < 1024) return `${Math.round(size)} B`;
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(1)} MB`;
  return `${(size / 1024 ** 3).toFixed(1)} GB`;
}

export function formatRate(bytesPerSecond: number): string {
  return bytesPerSecond < 1024 ** 2
    ? `${(Math.max(0, bytesPerSecond) / 1024).toFixed(1)} KB/s`
    : `${formatBytes(bytesPerSecond)}/s`;
}

/** Language-neutral m:ss / h:mm:ss, rounding up for remaining time. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor(total / 60) % 60;
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export const RECEIVE_STALL_MS = 1500;
const WINDOW_MS = 8000;
export type ReceptionEstimate = {
  state: "estimating" | "waiting" | "extra" | "remaining";
  framesPerSecond: number | null;
  seconds?: number;
};

/** Recent distinct-frame arrivals, rather than duplicate scans or peeling bursts. */
export class ReceptionEstimator {
  private samples: { at: number; frames: number }[] = [];

  reset() { this.samples = []; }

  record(at: number, frames: number) {
    const last = this.samples.at(-1);
    if (last && frames === last.frames) return;
    if (last && (frames < last.frames || at - last.at > RECEIVE_STALL_MS))
      this.reset();
    this.samples.push({ at, frames });
    // Retain one sample before the window boundary to measure complete intervals.
    while (this.samples.length > 2 && this.samples[1]!.at < at - WINDOW_MS)
      this.samples.shift();
  }

  estimate(now: number, targetFrames: number): ReceptionEstimate {
    const last = this.samples.at(-1);
    if (!last) return { state: "estimating", framesPerSecond: null };
    if (now - last.at > RECEIVE_STALL_MS)
      return { state: "waiting", framesPerSecond: 0 };
    const first = this.samples[0]!;
    const span = (now - first.at) / 1000;
    const count = last.frames - first.frames;
    const fps = span >= 1 && count >= 3 ? count / span : null;
    // Fountain completion is probabilistic: never count down to zero before
    // the decoder actually finishes, even after reaching the nominal frame goal.
    if (last.frames >= targetFrames) return { state: "extra", framesPerSecond: fps };
    if (fps === null) return { state: "estimating", framesPerSecond: null };
    return {
      state: "remaining", framesPerSecond: fps,
      seconds: (targetFrames - last.frames) / fps,
    };
  }
}
