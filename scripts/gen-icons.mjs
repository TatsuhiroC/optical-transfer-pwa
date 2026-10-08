// One vector mark supplies PWA, Apple, Android and the in-app brand.
// Keep the background full bleed; the OS applies its own launcher mask.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";

const root = new URL("../", import.meta.url);
const mark = readFileSync(new URL("resources/brand-mark.svg", root), "utf8")
  .replace(/<svg[^>]*>/, "")
  .replace(/<\/svg>\s*$/, "");
const background = `<defs>
  <linearGradient id="tile" x1="40" y1="0" x2="470" y2="512" gradientUnits="userSpaceOnUse">
    <stop stop-color="#243045"/><stop offset=".55" stop-color="#121a28"/><stop offset="1" stop-color="#0b0e14"/>
  </linearGradient>
  <radialGradient id="warm" cx=".18" cy=".12" r=".85">
    <stop stop-color="#ff777b" stop-opacity=".13"/><stop offset="1" stop-color="#ff777b" stop-opacity="0"/>
  </radialGradient>
</defs><path d="M0 0H512V512H0Z" fill="url(#tile)"/><path d="M0 0H512V512H0Z" fill="url(#warm)"/>`;

function svg(scale = 1.28, withBackground = true, monochrome = false) {
  const artwork = monochrome
    ? mark.replace(/url\(#(?:send|receive)\)|#fff5e9/g, "#ffffff")
    : mark;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" fill="none">${withBackground ? background : ""}<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${artwork}</g></svg>`;
}
async function png(path, size, artwork) {
  const target = new URL(path, root);
  mkdirSync(new URL(".", target), { recursive: true });
  await sharp(Buffer.from(artwork))
    .resize(size, size)
    .png()
    .toFile(target.pathname);
  console.log(`${path} (${size} x ${size})`);
}
for (const size of [192, 512])
  await png(`public/icons/icon-${size}.png`, size, svg());
await png("public/icons/icon-maskable-512.png", 512, svg(1.18));
await png("public/icons/apple-touch-icon.png", 180, svg());
// A new image gets a new URL so Safari need not reuse a cached Web Clip icon.
// Keep conventional entry points too; never remove the previous icon URL.
const appleIcon = await sharp(
  new URL("public/icons/apple-touch-icon.png", root).pathname,
)
  .flatten({ background: "#0b0e14" })
  .png()
  .toBuffer();
writeFileSync(new URL("public/icons/apple-touch-icon.png", root), appleIcon);
const appleName = `apple-touch-icon-${createHash("sha256").update(appleIcon).digest("hex").slice(0, 12)}.png`;
for (const name of [
  appleName,
  "apple-touch-icon.png",
  "apple-touch-icon-precomposed.png",
])
  writeFileSync(new URL(`public/${name}`, root), appleIcon);
const htmlPath = new URL("index.html", root);
const html = readFileSync(htmlPath, "utf8");
const appleLink =
  /(<link\s+[^>]*\brel="apple-touch-icon"[^>]*\bhref=")[^"]+("[^>]*>)/;
if (!appleLink.test(html))
  throw new Error("Apple touch icon link missing from index.html");
writeFileSync(htmlPath, html.replace(appleLink, `$1./${appleName}$2`));
await png("public/icons/favicon-32.png", 32, svg());
writeFileSync(new URL("public/icons/icon.svg", root), svg());
await png("resources/icon-only.png", 1024, svg());
// The mark fits inside Android's central 66/108 circle, including stroke edges.
await png("resources/icon-foreground.png", 1024, svg(1.02, false));
await png("resources/icon-monochrome.png", 1024, svg(1.02, false, true));
await png(
  "resources/icon-background.png",
  1024,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${background}</svg>`,
);
// Splash artwork is transparent; Android's resource generator adds the dark field.
for (const path of ["resources/splash.png", "resources/splash-dark.png"])
  await png(path, 2732, svg(0.3, false));
