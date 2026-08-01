// Minimal i18n: en / 中文 dictionaries, a t() lookup with {placeholder}
// substitution, and a language toggle persisted in localStorage. Static HTML
// text is wired via data-i18n attributes; dynamic strings go through t().

export type Lang = "en" | "zh";

type Dict = Record<string, string>;

const en: Dict = {
  "nav.send": "send",
  "nav.receive": "receive",
  "lang.toggle": "中文",
  "landing.title": "Optical Transfer",
  "landing.subtitle": "One app, two roles — files travel as light. No network, no pairing.",
  "landing.hint1":
    "Two devices run the same app: one sends, one receives — screen to camera.",
  "landing.send": "Send a file",
  "landing.receive": "Receive",

  "send.title": "Light-Code Sender",
  "send.subtitle": "Pick any file — the screen becomes a stream of light.",
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

  "receive.stats": "ready to receive light codes",
  "receive.settings": "Camera settings",
  "receive.capWidth": "capture width",
  "receive.capFps": "capture fps",
  "receive.workers": "decode workers",
  "receive.camera": "camera",
  "receive.camAuto": "auto · rear camera",
  "receive.settingsHint":
    "Defaults suit most phones. If decoding is hard, hold the device steady and raise the sender's screen brightness.",
  "receive.start": "Start receiving",
  "receive.secure":
    "✗ camera needs a secure context — this page must be served over https to use the camera from another device.",
  "receive.camErr": "✗ camera: {msg}",
  "receive.camDenied": "✗ camera permission denied — allow it in your browser settings and retry",
  "receive.searching": "searching for a light-code stream…",
  "receive.done": "Transfer Complete!",
  "receive.summary":
    "{name} · {kb} KB in {sec}s · {rate} KB/s · hash {ok}",
  "receive.hashOk": "verified ✓",
  "receive.hashBad": "MISMATCH ✗",
  "receive.save": "Save file",
  "receive.share": "Share",
  "receive.forward": "Send onward",
  "receive.noname": "received",
  "receive.rxTitle": "Light-Code Receiver",
  "receive.rxSubtitle": "No upload. Point the camera at the animated QR code on the sender.",
  "receive.capSecure": "Secure context",
  "receive.capCamera": "Camera",
  "receive.capCheck": "checking",
  "receive.capPending": "pending",
  "receive.capPendingCam": "pending permission",
  "receive.capPass": "ok",
  "receive.capFail": "failed",
  "receive.receiving": "Receiving",
  "receive.framesSuffix": "frames",
  "receive.restart": "Restart",

  "m.cap": "capture fps",
  "m.dec": "decode fps",
  "m.rate": "throughput",
  "m.time": "elapsed",
  "m.frames": "frames new/dup",
  "m.k": "source blocks",
  "m.block": "block size",
  "m.payload": "payload",
};

const zh: Dict = {
  "nav.send": "发送",
  "nav.receive": "接收",
  "lang.toggle": "EN",
  "landing.title": "光码互传",
  "landing.subtitle": "一个应用，两种角色——文件化作光传输。不联网、不配对。",
  "landing.hint1": "两台设备装同一应用：一台发送、一台接收——屏幕对镜头。",
  "landing.send": "发送文件",
  "landing.receive": "接收",

  "send.title": "光码发送器",
  "send.subtitle": "选择任意文件，屏幕化作一束光码。",
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

  "receive.stats": "准备接收光码",
  "receive.settings": "摄像头设置",
  "receive.capWidth": "采集宽度",
  "receive.capFps": "采集帧率",
  "receive.workers": "解码线程",
  "receive.camera": "摄像头",
  "receive.camAuto": "自动选择后置摄像头",
  "receive.settingsHint":
    "默认设置适合大多数手机。若识别困难，请保持设备稳定并调高发送端亮度。",
  "receive.start": "开启摄像头接收",
  "receive.secure":
    "✗ 摄像头需要安全上下文——必须通过 https 访问本页面才能从其他设备调用摄像头。",
  "receive.camErr": "✗ 摄像头：{msg}",
  "receive.camDenied": "✗ 摄像头权限被拒绝，请在浏览器设置中允许后重试",
  "receive.searching": "正在搜索光码…",
  "receive.done": "传输完成！",
  "receive.summary": "{name} · {kb} KB · 用时 {sec} 秒 · {rate} KB/s · 哈希{ok}",
  "receive.hashOk": "校验通过 ✓",
  "receive.hashBad": "不一致 ✗",
  "receive.save": "保存文件",
  "receive.share": "分享",
  "receive.forward": "转发给另一台设备",
  "receive.noname": "收到的文件",
  "receive.rxTitle": "光码接收器",
  "receive.rxSubtitle": "无需上传。让摄像头对准发送设备上的动态二维码。",
  "receive.capSecure": "安全环境",
  "receive.capCamera": "摄像头",
  "receive.capCheck": "检测中",
  "receive.capPending": "待启动",
  "receive.capPendingCam": "待授权",
  "receive.capPass": "通过",
  "receive.capFail": "失败",
  "receive.receiving": "正在接收",
  "receive.framesSuffix": "帧",
  "receive.restart": "重新接收",

  "m.cap": "采集帧率",
  "m.dec": "解码帧率",
  "m.rate": "接收速度",
  "m.time": "已用时间",
  "m.frames": "新帧/重复",
  "m.k": "源数据块",
  "m.block": "单块大小",
  "m.payload": "文件数据",
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
  for (const btn of document.querySelectorAll(".js-lang-btn")) {
    btn.textContent = t("lang.toggle");
  }
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
  for (const btn of document.querySelectorAll(".js-lang-btn")) {
    btn.addEventListener("click", () => setLang(lang === "en" ? "zh" : "en"));
  }
}
