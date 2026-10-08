import { expect, it, vi } from "vitest";

it("changing language updates labels without erasing runtime status", async () => {
  vi.resetModules();
  const status = { textContent: "", getAttribute: () => "receive.stats" };
  const label = { textContent: "", getAttribute: () => "nav.send" };
  vi.stubGlobal("document", {
    documentElement: {},
    querySelectorAll: (selector: string) => selector === "[data-i18n]" ? [status, label] : [],
  });
  vi.stubGlobal("navigator", { language: "en" });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  const { initI18n, setLang } = await import("../src/i18n");
  initI18n();
  status.textContent = "verification failed";
  setLang("zh");
  expect(label.textContent).toBe("发送");
  expect(status.textContent).toBe("verification failed");
  vi.unstubAllGlobals();
});
