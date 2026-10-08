/** Each mode owns a lock; stale asynchronous grants are released immediately. */
export class ScreenWakeLock {
  private wanted = false;
  private generation = 0;
  private lock: WakeLockSentinel | null = null;
  constructor() {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") this.release();
      else if (this.wanted) void this.acquire();
    });
  }
  setActive(active: boolean) {
    this.wanted = active;
    if (active) void this.acquire();
    else this.release();
  }
  private release() {
    this.generation++;
    const old = this.lock;
    this.lock = null;
    void old?.release().catch(() => undefined);
  }
  private async acquire() {
    if (this.lock || !this.wanted || document.visibilityState === "hidden") return;
    const gen = ++this.generation;
    try {
      const granted = await navigator.wakeLock?.request("screen");
      if (!granted) return;
      if (gen !== this.generation || !this.wanted || this.isHidden()) {
        await granted.release();
      } else this.lock = granted;
    } catch { /* The transfer also works without a screen lock. */ }
  }
  private isHidden() { return document.visibilityState === "hidden"; }
}
