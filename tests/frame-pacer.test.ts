import { expect, it } from "vitest";
import { FramePacer } from "../src/frame-pacer";

function simulate(target: number, refresh: number) {
  const pacer = new FramePacer(target), shown: number[] = [];
  for (let tick = 0; tick < refresh * 10; tick++) {
    const now = tick * 1000 / refresh;
    if (pacer.due(now)) { pacer.displayed(now); shown.push(tick); }
  }
  return shown;
}
it("preserves the default 24 fps average on 60 Hz, with at least two callbacks per code", () => {
  const shown = simulate(24, 60);
  expect(shown.length).toBe(240);
  expect(shown.slice(1).every((tick, i) => tick - shown[i]! >= 2)).toBe(true);
});
it("supports 30 fps on 60 Hz, and caps faster selections at half the display callback rate", () => {
  expect(simulate(30, 60)).toHaveLength(300);
  expect(simulate(60, 60)).toHaveLength(300);
  expect(simulate(60, 120)).toHaveLength(600);
  expect(simulate(30, 30)).toHaveLength(150);
});
it("does not catch up with a one-callback flash after a long rendering pause", () => {
  const pacer = new FramePacer(30);
  expect(pacer.due(0)).toBe(true); pacer.displayed(0);
  expect(pacer.due(16.7)).toBe(false);
  expect(pacer.due(500)).toBe(true); pacer.displayed(500);
  expect(pacer.due(516.7)).toBe(false);
  expect(pacer.due(533.4)).toBe(true);
});
it("rejects unusable frame rates", () => {
  for (const fps of [0, -1, NaN, Infinity]) expect(() => new FramePacer(fps)).toThrow(RangeError);
});
