import { registerSW } from "virtual:pwa-register";
import { isTransferActive, transferEvents } from "./store";
import { t } from "./i18n";

/** Never discard a selected/received file due to an automatic SW activation. */
export function initUpdates() {
  const button = document.getElementById("app-update") as HTMLButtonElement;
  let available = false;
  let requested = false;
  let activated = false;
  const render = () => {
    button.hidden = !available;
    button.disabled = isTransferActive() || requested;
    button.textContent = t(isTransferActive() ? "app.updateBusy" : "app.update");
  };
  const update = registerSW({
    immediate: true,
    onNeedRefresh() { available = true; render(); },
    onNeedReload() {
      activated = true;
      if (requested && !isTransferActive()) location.reload();
      else { requested = false; available = true; render(); }
    },
  });
  transferEvents.addEventListener("change", render);
  button.onclick = () => {
    if (isTransferActive() || !available) return;
    if (activated) { location.reload(); return; }
    requested = true;
    render();
    // Reload only after the new worker controls this page (onNeedReload).
    void update(true).catch(() => { requested = false; render(); });
  };
}
