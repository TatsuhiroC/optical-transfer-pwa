// App icons: the brand itself is a QR code, so the icon is one too —
// orange field (the UI accent), dark modules. Run with `npm run icons`.
//
// Also emits the Android sources that `npx @capacitor/assets generate --android
// --assetPath resources` consumes (legacy icon, adaptive foreground/background,
// splash), because the Capacitor template would otherwise ship its own logo.
import { mkdirSync, writeFileSync } from "node:fs";
import QRCode from "qrcode";
import sharp from "sharp";

const BRAND = "DECIMEN OPTICAL TRANSFER";
const ACCENT = "#ffb257"; // the sender's code colour / UI accent
const INK = "#121009"; // module colour, matches the app background
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 }; // transparent, so the adaptive background shows through

const pwaDir = new URL("../public/icons/", import.meta.url);
const androidDir = new URL("../resources/", import.meta.url);

/**
 * A QR "photo": `margin` is in modules, so it also decides how much of the canvas
 * stays empty. qrcode rounds its canvas to whole modules, which can land a pixel
 * short of `size` — `@capacitor/assets` wants exact squares, so pad it back with
 * nearest-neighbour (no resampling, the modules stay square).
 */
const qrPng = async (size, margin, dark, light) => {
  const png = await QRCode.toBuffer(BRAND, {
    width: size,
    margin,
    errorCorrectionLevel: "M",
    color: { dark, light },
  });
  return sharp(png)
    .resize(size, size, { fit: "contain", kernel: "nearest", background: CLEAR })
    .png()
    .toBuffer();
};

const targets = {
  "public/icons/icon-192.png": [pwaDir, await qrPng(192, 6, INK, ACCENT)],
  "public/icons/icon-512.png": [pwaDir, await qrPng(512, 6, INK, ACCENT)],
  // legacy launcher icon: full bleed, like the PWA icon
  "resources/icon-only.png": [androidDir, await qrPng(1024, 8, INK, ACCENT)],
  // adaptive icon: the dark QR floats on iconBackgroundColor, and the wider margin
  // keeps it inside the mask's safe zone on every launcher shape
  "resources/icon-foreground.png": [androidDir, await qrPng(1024, 12, INK, "#00000000")],
  "resources/icon-background.png": [
    androidDir,
    await sharp({ create: { width: 1024, height: 1024, channels: 4, background: ACCENT } })
      .png()
      .toBuffer(),
  ],
  // splash: a small orange code on the dark background, both light and dark themes
  "resources/splash.png": [androidDir, await qrPng(2732, 51, ACCENT, "#00000000")],
  "resources/splash-dark.png": [androidDir, await qrPng(2732, 51, ACCENT, "#00000000")],
};

for (const [name, [dir, png]] of Object.entries(targets)) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL(name.split("/").pop(), dir), png);
  console.log(`${name} (${png.length} bytes)`);
}
