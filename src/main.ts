// App shell: one page, three views (landing / send / receive) switched by
// hash routing. Only one mode runs at a time — a single screen can't both
// show codes and film them, so entering a mode exits the other.

import { enterSend, exitSend } from "./send";
import { enterReceive, exitReceive } from "./receive";
import { initI18n } from "./i18n";

const $ = (id: string) => document.getElementById(id)!;
const views = {
  landing: $("view-landing"),
  send: $("view-send"),
  receive: $("view-receive"),
};
const navSend = $("nav-send");
const navReceive = $("nav-receive");

let current: keyof typeof views = "landing";

function show(name: keyof typeof views) {
  if (current === name) return;
  if (current === "send") exitSend();
  if (current === "receive") exitReceive();
  current = name;
  for (const [k, v] of Object.entries(views)) v.hidden = k !== name;
  // the receiver has its own visual language (qrrec style) — switch the
  // whole page background/font to match it
  document.body.classList.toggle("rx-mode", name === "receive");
  navSend.classList.toggle("active", name === "send");
  navReceive.classList.toggle("active", name === "receive");
  if (name === "send") enterSend();
  if (name === "receive") enterReceive();
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
route();
