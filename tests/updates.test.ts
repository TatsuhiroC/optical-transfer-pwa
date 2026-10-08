import { beforeEach, expect, it, vi } from "vitest";

const sw = vi.hoisted(() => ({ options: {} as {
  onNeedRefresh?: () => void; onNeedReload?: () => void;
}, update: vi.fn() }));
vi.mock("virtual:pwa-register", () => ({ registerSW: (options: typeof sw.options) => {
  sw.options = options; return sw.update;
} }));
let button: { hidden: boolean; disabled: boolean; textContent: string; onclick: (() => void) | null };
let reload: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetModules(); sw.update.mockReset().mockResolvedValue(undefined);
  button = { hidden: true, disabled: false, textContent: "", onclick: null };
  reload = vi.fn();
  vi.stubGlobal("document", { getElementById: () => button });
  vi.stubGlobal("location", { reload });
  vi.stubGlobal("navigator", { language: "en" });
  vi.stubGlobal("localStorage", { getItem: () => null });
});

it("automatic worker activation never refreshes a live transfer", async () => {
  const { initUpdates } = await import("../src/updates");
  const { setTransferActive } = await import("../src/store");
  initUpdates(); setTransferActive("receive", true);
  sw.options.onNeedReload!();
  expect(reload).not.toHaveBeenCalled(); expect(button.disabled).toBe(true);
  setTransferActive("receive", false);
  expect(button.disabled).toBe(false);
  button.onclick!(); expect(reload).toHaveBeenCalledOnce();
});

it("explicit update waits for control before reloading", async () => {
  const { initUpdates } = await import("../src/updates");
  initUpdates(); sw.options.onNeedRefresh!(); button.onclick!();
  await Promise.resolve();
  expect(sw.update).toHaveBeenCalledWith(true);
  expect(reload).not.toHaveBeenCalled();
  sw.options.onNeedReload!(); expect(reload).toHaveBeenCalledOnce();
});

it("a transfer started during activation prevents the requested refresh", async () => {
  const { initUpdates } = await import("../src/updates");
  const { setTransferActive } = await import("../src/store");
  initUpdates(); sw.options.onNeedRefresh!(); button.onclick!();
  setTransferActive("send", true); sw.options.onNeedReload!();
  expect(reload).not.toHaveBeenCalled();
  setTransferActive("send", false); expect(reload).not.toHaveBeenCalled();
  button.onclick!(); expect(reload).toHaveBeenCalledOnce();
});
