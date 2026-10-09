import QRCode from "qrcode";
import { setText } from "./i18n";

// Native builds use an internal origin, so invitations always target the public home.
export const PUBLIC_HOME_URL =
  "https://tatsuhiroc.github.io/optical-transfer-pwa/";

export async function createInviteQr(): Promise<string> {
  const svg = await QRCode.toString(PUBLIC_HOME_URL, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 4,
  });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function closeInvite() {
  const dialog = document.getElementById("invite-dialog") as HTMLDialogElement;
  if (dialog.open) dialog.close();
}

export function initInvite() {
  const button = document.getElementById("invite-button") as HTMLButtonElement;
  const dialog = document.getElementById("invite-dialog") as HTMLDialogElement;
  const image = document.getElementById("invite-qr") as HTMLImageElement;
  const status = document.getElementById("invite-status")!;
  const link = document.getElementById("invite-url") as HTMLAnchorElement;
  link.href = PUBLIC_HOME_URL;
  link.textContent = PUBLIC_HOME_URL.replace("https://", "");

  button.addEventListener("click", () => {
    if (dialog.open) return;
    dialog.showModal();
    document.body.classList.add("invite-open");
    image.hidden = true;
    status.hidden = false;
    setText(status, "invite.loading");
    void createInviteQr().then(
      (src) => {
        image.src = src;
        image.hidden = false;
        status.hidden = true;
      },
      () => setText(status, "invite.error"),
    );
  });
  document
    .getElementById("invite-close")!
    .addEventListener("click", closeInvite);
  dialog.addEventListener("close", () => {
    document.body.classList.remove("invite-open");
  });
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    ) {
      dialog.close();
    }
  });
}
