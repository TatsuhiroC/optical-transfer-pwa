/** Phase-locked display cadence with bounded recovery after a missed deadline. */
export class FramePacer {
  private readonly interval: number;
  private nextAt: number | null = null;
  private callbacksSinceDisplay = 0;

  constructor(fps: number) {
    if (!Number.isFinite(fps) || fps <= 0) throw new RangeError("Invalid frame rate");
    this.interval = 1000 / fps;
  }

  due(now: number): boolean {
    this.callbacksSinceDisplay++;
    return this.nextAt === null ||
      (this.callbacksSinceDisplay >= 2 && now + 0.01 >= this.nextAt);
  }

  displayed(now: number): void {
    const deadline = this.nextAt;
    // A long pause starts a fresh schedule. Smaller delays keep the requested
    // average cadence, but cannot produce back-to-back animation callbacks.
    this.nextAt = deadline === null || now - deadline >= this.interval ?
      now + this.interval : deadline + this.interval;
    this.callbacksSinceDisplay = 0;
  }
}
