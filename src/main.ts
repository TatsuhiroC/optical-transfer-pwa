// App shell: one page, three views (landing / send / receive) switched by
// hash routing. Only one mode runs at a time — a single screen can't both
// show codes and film them, so entering a mode exits the other.

import { Capacitor } from "@capacitor/core";
import { initUpdates } from "./updates";
import { enterSend, exitSend } from "./send";
import { enterReceive, exitReceive } from "./receive";
import { initI18n } from "./i18n";
import { initInvite, closeInvite } from "./invite";

const $ = (id: string) => document.getElementById(id)!;
const views = {
  landing: $("view-landing"),
  send: $("view-send"),
  receive: $("view-receive"),
};
const navHome = $("nav-home");
const navSend = $("nav-send");
const navReceive = $("nav-receive");

let current: keyof typeof views | null = null;

function show(name: keyof typeof views) {
  if (current === name) return;
  if (current === "send") exitSend();
  if (current === "receive") exitReceive();
  current = name;
  if (name !== "landing") closeInvite();
  for (const [k, v] of Object.entries(views)) v.hidden = k !== name;
  navHome.classList.toggle("active", name === "landing");
  for (const [link, role] of [
    [navHome, "landing"],
    [navSend, "send"],
    [navReceive, "receive"],
  ] as const) {
    if (role === name) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  navSend.classList.toggle("active", name === "send");
  navReceive.classList.toggle("active", name === "receive");
  if (name === "send") enterSend();
  if (name === "receive") enterReceive();
  window.scrollTo({ top: 0, behavior: "instant" });
}

function route() {
  const h = location.hash;
  if (h === "#/send") show("send");
  else if (h === "#/receive") show("receive");
  else show("landing");
}

window.addEventListener("hashchange", route);
$("btn-send").onclick = () => {
  location.hash = "#/send";
};
$("btn-receive").onclick = () => {
  location.hash = "#/receive";
};
initI18n();
initInvite();
route();

// The service worker is a web-only concern. Inside the Android shell every asset
// is already served from the APK, and a precaching worker there keeps handing out
// the previous version's files after an app update — its cache lives in the
// WebView's storage, which survives the install (observed: a freshly installed APK
// still ran the old bundle until the registration was dropped).
if (Capacitor.isNativePlatform()) {
  void navigator.serviceWorker?.getRegistrations().then(async (regs) => {
    if (regs.length === 0) return;
    for (const reg of regs) await reg.unregister();
    for (const key of await caches.keys()) await caches.delete(key);
    // The current page was rendered from that stale precache; the next launch
    // serves the APK's own assets.
  });
} else {
  initUpdates();
}
