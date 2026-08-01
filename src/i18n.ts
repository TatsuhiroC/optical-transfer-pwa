// Minimal i18n: en / 中文 dictionaries, a t() lookup with {placeholder}
// substitution, and a language toggle persisted in localStorage. Static HTML
// text is wired via data-i18n attributes; dynamic strings go through t().

export type Lang = "en" | "zh";

type Dict = Record<string, string>;

const en: Dict = {
  "nav.send": "send",
  "nav.receive": "receive",
  "lang.toggle": "中文",
  "landing.hint1":
    "One app, two roles — the same device can transmit or receive, just pick a role. Files travel as an endless stream of fountain-coded QR codes; the other device points its camera at the screen. No network path is used, nothing to pair, nothing to install on the other side.",
  "landing.send": "Send a file",
  "landing.receive": "Receive",

  "send.choose": "choose a file to transmit",
  "send.drop": "drag & drop a file here, or",
  "send.btnFile": "choose file",
  "send.btnPhoto": "photo / album",
  "send.settings": "Settings",
  "send.txFps": "tx fps",
  "send.bytes": "bytes / frame",
  "send.ecc": "error correction",
  "send.size": "display size",
  "send.settingsHint":
    "Changes restart the stream — the receiver resets automatically (new session id in the frame headers; that's the fountain protocol's gift).",
  "send.stop": "stop",
  "send.resend": "resend",
  "send.clear": "remove file",
  "send.stopped": "stream stopped",
  "send.hint":
    "Max screen brightness helps. Keep the stream running until the receiver says done.",
  "send.tooLarge": "✗ file too large (protocol ceiling 4 GiB)",
  "send.tooManyBlocks":
    "✗ {name} needs {k} blocks but the protocol caps at 65535 — raise bytes/frame or pick a smaller file",
  "send.genErr": "✗ {msg}",
  "send.progress": "frames sent: {n} · receiver needs ~{m} of any",

  "receive.stats": "point the camera at the sender's code",
  "receive.settings": "Settings",
  "receive.capWidth": "capture width",
  "receive.capFps": "capture fps",
  "receive.workers": "decode workers",
  "receive.settingsHint":
    "Set before starting the camera. 1280-wide is the widest mode iOS runs at a true 60 fps; the fps request is demanded with `exact` first because `ideal: 60` silently delivers 30.",
  "receive.start": "Start camera",
  "receive.secure":
    "✗ camera needs a secure context — this page must be served over https to use the camera from another device.",
  "receive.camErr": "✗ camera: {msg}",
  "receive.searching": "camera {w}×{h}@{fps} — searching for a stream…",
  "receive.done": "Transfer Complete!",
  "receive.summary":
    "{name} · {kb} KB in {sec}s · {rate} KB/s · hash {ok}",
  "receive.hashOk": "verified ✓",
  "receive.hashBad": "MISMATCH ✗",
  "receive.save": "save",
  "receive.share": "share",
  "receive.forward": "send onward",
  "receive.noname": "received",

  "m.cap": "capture fps",
  "m.dec": "decode fps",
  "m.rate": "goodput",
  "m.time": "elapsed",
  "m.frames": "frames new/dup",
  "m.k": "blocks K",
  "m.block": "block len",
  "m.payload": "payload",
};

const zh: Dict = {
  "nav.send": "发送",
  "nav.receive": "接收",
  "lang.toggle": "EN",
  "landing.hint1":
    "一个应用、两种角色——同一台设备既能发送也能接收，选一个角色即可。文件会变成源源不断的喷泉码动态二维码；另一台设备用摄像头对准屏幕就能还原。设备之间不经过任何网络，无需配对，对方也无需安装任何东西。",
  "landing.send": "发送文件",
  "landing.receive": "接收",

  "send.choose": "选择要发送的文件",
  "send.drop": "把文件拖到这里，或",
  "send.btnFile": "选择文件",
  "send.btnPhoto": "相册 / 图库",
  "send.settings": "设置",
  "send.txFps": "发送帧率",
  "send.bytes": "每帧字节数",
  "send.ecc": "纠错级别",
  "send.size": "显示尺寸",
  "send.settingsHint":
    "修改会重启数据流——接收端会自动重置（帧头带新的 session id，这是喷泉码协议的礼物）。",
  "send.stop": "停止",
  "send.resend": "重新发送",
  "send.clear": "移除文件",
  "send.stopped": "数据流已停止",
  "send.hint": "屏幕调到最大亮度效果更好。一直保持发送，直到接收端提示完成。",
  "send.tooLarge": "✗ 文件过大（协议上限 4 GiB）",
  "send.tooManyBlocks":
    "✗ {name} 需要 {k} 个块，但协议上限是 65535——调大每帧字节数，或换个更小的文件",
  "send.genErr": "✗ {msg}",
  "send.progress": "已发送 {n} 帧 · 接收端任意收集 ~{m} 帧即可",

  "receive.stats": "把摄像头对准发送端的二维码",
  "receive.settings": "设置",
  "receive.capWidth": "采集宽度",
  "receive.capFps": "采集帧率",
  "receive.workers": "解码线程数",
  "receive.settingsHint":
    "请在开启摄像头前设置。1280 宽是 iOS 真正跑到 60 fps 的最宽档位；帧率先用 `exact` 强求（`ideal: 60` 会被 iOS 悄悄降成 30）。",
  "receive.start": "开启摄像头",
  "receive.secure":
    "✗ 摄像头需要安全上下文——必须通过 https 访问本页面才能从其他设备调用摄像头。",
  "receive.camErr": "✗ 摄像头：{msg}",
  "receive.searching": "摄像头 {w}×{h}@{fps} — 正在搜索数据流…",
  "receive.done": "传输完成！",
  "receive.summary": "{name} · {kb} KB · 用时 {sec} 秒 · {rate} KB/s · 哈希{ok}",
  "receive.hashOk": "校验通过 ✓",
  "receive.hashBad": "不一致 ✗",
  "receive.save": "保存",
  "receive.share": "分享",
  "receive.forward": "转发",
  "receive.noname": "收到的文件",

  "m.cap": "采集帧率",
  "m.dec": "解码帧率",
  "m.rate": "吞吐",
  "m.time": "耗时",
  "m.frames": "帧 新/重",
  "m.k": "块数 K",
  "m.block": "块大小",
  "m.payload": "文件大小",
};

export type I18nKey = keyof typeof en;

let lang: Lang = "en";
try {
  const saved = localStorage.getItem("otp-lang");
  if (saved === "en" || saved === "zh") lang = saved;
  else if ((navigator.language || "en").toLowerCase().startsWith("zh")) lang = "zh";
} catch {
  /* private mode etc. */
}

export function getLang(): Lang {
  return lang;
}

/** Look up a string; {name} placeholders are replaced from `vars`. */
export function t(key: I18nKey, vars?: Record<string, string | number>): string {
  let s = (lang === "zh" ? zh[key] : en[key]) ?? en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

const staticEls = new Set<Element>();

function applyStatic() {
  for (const el of staticEls) {
    const key = el.getAttribute("data-i18n") as I18nKey | null;
    if (key && el.textContent !== t(key)) el.textContent = t(key);
  }
  document.title = lang === "zh" ? "光传输 — 喷泉码二维码文件传输" : "Optical Transfer — fountain QR file transfer";
  const btn = document.getElementById("lang-btn");
  if (btn) btn.textContent = t("lang.toggle");
}

/** Register an element wired via data-i18n (idempotent). */
export function bindStatic(root: ParentNode = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) staticEls.add(el);
}

export function setLang(l: Lang) {
  lang = l;
  try {
    localStorage.setItem("otp-lang", l);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = l === "zh" ? "zh-CN" : "en";
  applyStatic();
}

export function initI18n() {
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  bindStatic();
  applyStatic();
  const btn = document.getElementById("lang-btn");
  btn?.addEventListener("click", () => setLang(lang === "en" ? "zh" : "en"));
}
