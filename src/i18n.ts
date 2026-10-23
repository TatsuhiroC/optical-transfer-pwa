import { uiEn, uiZh } from "./ui-copy";
// Minimal i18n: en / 中文 dictionaries, a t() lookup with {placeholder}
// substitution, and a language toggle persisted in localStorage. Static HTML
// text is wired via data-i18n attributes; dynamic strings go through t().

export type Lang = "en" | "zh";

type Dict = Record<string, string>;

const en = {
  ...uiEn,
  "nav.home": "Home",
  "nav.send": "Send",
  "nav.receive": "Receive",
  "lang.toggle": "中文",
  "landing.title": "Optical Transfer",
  "invite.button": "Invite",
  "invite.title": "Invite a companion",
  "invite.description": "Have them scan this code to open the same home page.",
  "invite.close": "Close",
  "invite.loading": "Preparing the QR code…",
  "invite.error": "Could not create the code. Open the link below instead.",
  "invite.network": "Internet is needed for the first visit.",

  "send.mode": "What to send",
  "send.modeFile": "File",
  "send.modeText": "Text",
  "send.textLabel": "Your message",
  "send.textPlaceholder": "Type or paste text, a link, or code…",
  "send.textHint": "Kept in this page only",
  "send.textSize": "{kb} KB / 4 MiB",
  "send.textLimit": "Text is limited to 4 MiB. Shorten it to continue.",
  "send.textStart": "Send text",
  "send.chooseText": "Type or paste text to send",

  "send.subtitle": "Have the other phone point its camera at your screen.",
  "send.choose": "Choose a file or text to send",
  "send.drop": "You can also drop a file here",
  "send.btnFile": "Choose another file",
  "send.btnPhoto": "Choose a photo",
  "send.settings": "Settings",
  "send.txFps": "tx fps",
  "send.bytes": "bytes / frame",
  "send.ecc": "error correction",
  "send.size": "display size",
  "send.lanes": "QR codes",
  "send.settingsHint":
    "Defaults suit most phones. Changing a setting restarts the stream and resets the receiver’s progress.",
  "send.stop": "Stop",
  "send.resend": "Resend",
  "send.clear": "Remove content",
  "send.stopped": "stream stopped",
  "send.tooManyBlocks":
    "✗ {name} needs {k} blocks but the protocol caps at 65535 — raise bytes/frame or pick a smaller file",
  "send.empty": "✗ that file is empty — there is nothing to transmit",
  "send.memoryLimit":
    "✗ files are limited to 64 MiB to keep memory use bounded",
  "send.readErr": "✗ could not read file: {msg}",
  "receive.hashFailed":
    "✗ file verification failed — restart receiving; this file cannot be saved or forwarded",
  "receive.limit":
    "✗ transfer exceeds the 64 MiB file limit or decoder memory/frame budget — restart receiving",
  "receive.workerErr":
    "✗ decoder could not start or stopped responding — restart receiving",
  "receive.stalled": "✗ no new frames for 60 seconds — restart receiving",
  "app.update": "Update and reopen (clears current content)",
  "app.updateBusy": "Update available — finish or stop transfer first",
  "send.genErr": "✗ {msg}",

  "receive.stats": "ready to receive light codes",
  "receive.badStream":
    "✗ ignoring an invalid light-code stream — its frame header does not describe a real file",
  "receive.settings": "Camera settings",
  "receive.capWidth": "capture width",
  "receive.capFps": "capture fps",
  "receive.workers": "decode workers",
  "receive.track": "Auto-track light codes",
  "receive.settingsHint":
    "Defaults suit most phones. If decoding is hard, hold the device steady and raise the sender's screen brightness.",
  "receive.start": "Start receiving",
  "receive.secure":
    "✗ camera needs a secure context — this page must be served over https to use the camera from another device.",
  "receive.camErr": "✗ camera: {msg}",
  "receive.camDenied":
    "✗ camera permission denied — allow it in your browser settings and retry",
  "receive.searching": "searching for a light-code stream…",
  "receive.done": "Your file has arrived.",
  "receive.textDone": "Your words have arrived.",
  "receive.textLabel": "Received text",
  "receive.copyText": "Copy text",
  "receive.copied": "Text copied.",
  "receive.copyManual": "Automatic copy is unavailable. Select the text and copy it manually.",
  "receive.summary": "{name} · {kb} KB in {sec}s · {rate} KB/s · hash verified ✓",
  "receive.save": "Save file",
  "receive.saving": "saving…",
  "receive.saved": "saved to {path}",
  "receive.saveErr": "✗ save failed: {msg}",
  "receive.share": "Share",
  "receive.forward": "Send onward",
  "receive.noname": "received",
  "receive.rxSubtitle":
    "No upload. Point the camera at the animated QR code on the sender.",
  "receive.capSecure": "Secure context",
  "receive.capCamera": "Camera",
  "receive.capCheck": "checking",
  "receive.capPending": "pending",
  "receive.capPendingCam": "pending permission",
  "receive.capPass": "ok",
  "receive.capFail": "failed",
  "receive.restart": "Restart",


  "m.cap": "capture fps",
  "m.scan": "scan time",
  "m.dropped": "frames skipped while busy",
  "m.dec": "decode fps",
  "m.rate": "throughput",
  "m.time": "elapsed",
  "m.frames": "frames new/dup",
  "m.k": "source blocks",
  "m.block": "block size",
  "m.payload": "payload",
} satisfies Dict;

const zh = {
  ...uiZh,
  "invite.button": "扫码邀请",
  "invite.title": "邀请同伴",
  "invite.description": "让同伴扫码，打开同一个首页。",
  "invite.close": "关闭",
  "invite.loading": "正在生成二维码…",
  "invite.error": "二维码生成失败，请使用下方网址。",
  "invite.network": "首次打开需要网络。",
  "nav.home": "首页",
  "nav.send": "发送",
  "nav.receive": "接收",
  "lang.toggle": "EN",
  "landing.title": "Optical Transfer",

  "send.mode": "发送内容",
  "send.modeFile": "文件",
  "send.modeText": "文字",
  "send.textLabel": "要发送的文字",
  "send.textPlaceholder": "输入或粘贴文字、链接、代码……",
  "send.textHint": "仅保留在当前页面",
  "send.textSize": "{kb} KB / 4 MiB",
  "send.textLimit": "文字最多 4 MiB，请精简后再发送。",
  "send.textStart": "发送文字",
  "send.chooseText": "输入或粘贴要发送的文字",

  "send.subtitle": "发送时，让另一台手机对准你的屏幕。",
  "send.choose": "选择文件，或输入文字",
  "send.drop": "也可把文件拖到这里",
  "send.btnFile": "选择其他文件",
  "send.btnPhoto": "选择照片",
  "send.settings": "设置",
  "send.txFps": "发送帧率",
  "send.bytes": "每帧字节数",
  "send.ecc": "纠错级别",
  "send.size": "显示尺寸",
  "send.lanes": "二维码数量",
  "send.settingsHint":
    "默认设置适合大多数手机。修改参数会重新发送，并重置接收端的进度。",
  "send.stop": "停止",
  "send.resend": "重新发送",
  "send.clear": "移除内容",
  "send.stopped": "数据流已停止",
  "send.tooManyBlocks":
    "✗ {name} 需要 {k} 个块，但协议上限是 65535——调大每帧字节数，或换个更小的文件",
  "send.empty": "✗ 该文件为空，没有可发送的内容",
  "send.memoryLimit": "✗ 为控制内存使用，文件大小上限为 64 MiB",
  "send.readErr": "✗ 无法读取文件：{msg}",
  "receive.hashFailed": "✗ 文件校验失败，请重新接收；此文件不能保存或转发",
  "receive.limit": "✗ 已超过 64 MiB 文件上限或解码内存/帧数限制，请重新接收",
  "receive.workerErr": "✗ 解码器启动失败或无响应，请重新接收",
  "receive.stalled": "✗ 已连续 60 秒没有收到新帧，请重新接收",
  "app.update": "更新并重新打开（会清除当前内容）",
  "app.updateBusy": "有可用更新，请先完成或停止传输",
  "send.genErr": "✗ {msg}",

  "receive.stats": "准备接收光码",
  "receive.badStream": "✗ 已忽略非法的光码流——帧头描述的不是一个合法文件",
  "receive.settings": "摄像头设置",
  "receive.capWidth": "采集宽度",
  "receive.capFps": "采集帧率",
  "receive.workers": "解码线程",
  "receive.track": "自动追踪光码",
  "receive.settingsHint":
    "默认设置适合大多数手机。若识别困难，请保持设备稳定并调高发送端亮度。",
  "receive.start": "开启摄像头接收",
  "receive.secure":
    "✗ 摄像头需要安全上下文——必须通过 https 访问本页面才能从其他设备调用摄像头。",
  "receive.camErr": "✗ 摄像头：{msg}",
  "receive.camDenied": "✗ 摄像头权限被拒绝，请在浏览器设置中允许后重试",
  "receive.searching": "正在搜索光码…",
  "receive.done": "文件已抵达。",
  "receive.textDone": "文字已抵达。",
  "receive.textLabel": "收到的文字",
  "receive.copyText": "复制文字",
  "receive.copied": "文字已复制。",
  "receive.copyManual": "无法自动复制，请长按或选中文字后手动复制。",
  "receive.summary":
    "{name} · {kb} KB · 用时 {sec} 秒 · {rate} KB/s · 哈希校验通过 ✓",
  "receive.save": "保存文件",
  "receive.saving": "保存中…",
  "receive.saved": "已保存到 {path}",
  "receive.saveErr": "✗ 保存失败：{msg}",
  "receive.share": "分享",
  "receive.forward": "转发给另一台设备",
  "receive.noname": "收到的文件",
  "receive.rxSubtitle": "无需上传。让摄像头对准发送设备上的动态二维码。",
  "receive.capSecure": "安全环境",
  "receive.capCamera": "摄像头",
  "receive.capCheck": "检测中",
  "receive.capPending": "待启动",
  "receive.capPendingCam": "待授权",
  "receive.capPass": "通过",
  "receive.capFail": "失败",
  "receive.restart": "重新接收",


  "m.cap": "采集帧率",
  "m.scan": "识别耗时",
  "m.dropped": "忙碌时跳过画面",
  "m.dec": "解码帧率",
  "m.rate": "接收速度",
  "m.time": "已用时间",
  "m.frames": "新帧/重复",
  "m.k": "源数据块",
  "m.block": "单块大小",
  "m.payload": "文件数据",
} satisfies Record<keyof typeof en, string>;

export type I18nKey = keyof typeof en;

let lang: Lang = "en";
try {
  const saved = localStorage.getItem("otp-lang");
  if (saved === "en" || saved === "zh") lang = saved;
  else if ((navigator.language || "en").toLowerCase().startsWith("zh"))
    lang = "zh";
} catch {
  /* private mode etc. */
}

/** Look up a string; {name} placeholders are replaced from `vars`. */
export function t(
  key: I18nKey,
  vars?: Record<string, string | number>,
): string {
  const template = (lang === "zh" ? zh[key] : en[key]) ?? en[key] ?? key;
  return vars
    ? template.replace(/\{([^{}]+)\}/g, (placeholder, name: string) =>
        Object.hasOwn(vars, name) ? String(vars[name]) : placeholder)
    : template;
}

const staticEls = new Set<Element>();
const attributeEls = new Set<Element>();
const dynamicTexts = new Map<
  Element,
  { key: I18nKey; vars?: Record<string, string | number>; text: string }
>();

/** Remember the message and its values so a language switch never resets state. */
export function setText(
  el: Element,
  key: I18nKey,
  vars?: Record<string, string | number>,
) {
  for (const [old] of dynamicTexts)
    if (old.isConnected === false) dynamicTexts.delete(old);
  const text = t(key, vars);
  el.textContent = text;
  dynamicTexts.set(el, { key, vars, text });
}
const appliedStatic = new WeakMap<Element, string>();

function applyStatic() {
  for (const el of staticEls) {
    if (dynamicTexts.has(el)) continue;
    const key = el.getAttribute("data-i18n") as I18nKey | null;
    // Runtime status replaces these initial labels. Do not reset a live
    // progress/error/capability message when changing the language.
    const previous = appliedStatic.get(el);
    if (previous !== undefined && el.textContent !== previous) continue;
    if (key) {
      const text = t(key);
      el.textContent = text;
      appliedStatic.set(el, text);
    }
  }
  for (const el of attributeEls) {
    for (const attr of ["aria-label", "title", "placeholder"]) {
      const key = el.getAttribute(`data-i18n-${attr}`);
      if (key) el.setAttribute(attr, t(key as I18nKey));
    }
  }
  for (const [el, message] of dynamicTexts) {
    if (el.isConnected === false || el.textContent !== message.text) {
      dynamicTexts.delete(el);
      continue;
    }
    message.text = t(message.key, message.vars);
    el.textContent = message.text;
  }
  document.title =
    lang === "zh"
      ? "Optical Transfer · 光码互传 — 喷泉码二维码文件传输"
      : "Optical Transfer — fountain QR file transfer";
  for (const btn of document.querySelectorAll(".js-lang-btn")) {
    btn.textContent = t("lang.toggle");
    btn.setAttribute?.(
      "aria-label",
      lang === "zh" ? "Switch to English" : "切换为中文",
    );
  }
}

/** Register an element wired via data-i18n (idempotent). */
export function bindStatic(root: ParentNode = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) staticEls.add(el);
  for (const el of root.querySelectorAll(
    "[data-i18n-aria-label], [data-i18n-title], [data-i18n-placeholder]",
  ))
    attributeEls.add(el);
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
