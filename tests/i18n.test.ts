import { expect, it, vi } from "vitest";

it("changing language updates labels without erasing runtime status", async () => {
  vi.resetModules();
  const status = { textContent: "", getAttribute: () => "receive.stats" };
  const label = { textContent: "", getAttribute: () => "nav.send" };
  const brand = { textContent: "", getAttribute: () => "landing.title" };
  vi.stubGlobal("document", {
    documentElement: {},
    querySelectorAll: (selector: string) =>
      selector === "[data-i18n]" ? [status, label, brand] : [],
  });
  vi.stubGlobal("navigator", { language: "en" });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  const { initI18n, setLang } = await import("../src/i18n");
  initI18n();
  status.textContent = "verification failed";
  setLang("zh");
  expect(label.textContent).toBe("发送");
  expect(status.textContent).toBe("verification failed");
  expect(brand.textContent).toBe("Optical Transfer");
  expect(document.title).toContain("光码互传");
  setLang("en");
  expect(brand.textContent).toBe("Optical Transfer");
  expect(document.title).toBe("Optical Transfer — fountain QR file transfer");
  vi.unstubAllGlobals();
});

it("managed live messages translate values without reverting to the initial label", async () => {
  vi.resetModules();
  const status = {
    textContent: "",
    isConnected: true,
    getAttribute: () => "receive.stats",
  };
  vi.stubGlobal("document", {
    documentElement: {},
    querySelectorAll: (s: string) => (s === "[data-i18n]" ? [status] : []),
  });
  vi.stubGlobal("navigator", { language: "en" });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  try {
    const { initI18n, setLang, setText } = await import("../src/i18n");
    initI18n();
    setText(status as unknown as Element, "ui.progressFrames", {
      n: 17,
      m: 29,
    });
    setLang("zh");
    expect(status.textContent).toBe("已收集 17 / 约 29 帧");
    setLang("en");
    expect(status.textContent).toBe("Collected 17 / about 29 frames");
  } finally {
    vi.unstubAllGlobals();
  }
});

it("removed result labels are released when new live messages are registered", async () => {
  vi.resetModules();
  vi.stubGlobal("document", {
    documentElement: {},
    querySelectorAll: () => [],
  });
  vi.stubGlobal("navigator", { language: "en" });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  try {
    const { setText, setLang } = await import("../src/i18n");
    const old = { textContent: "", isConnected: true };
    setText(old as Element, "receive.save");
    old.isConnected = false;
    setText(
      { textContent: "", isConnected: true } as Element,
      "receive.searching",
    );
    old.isConnected = true;
    setLang("zh");
    expect(old.textContent).toBe("Save file");
  } finally {
    vi.unstubAllGlobals();
  }
});
