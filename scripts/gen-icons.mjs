// App icon: the brand itself is a QR code, so the icon is one too —
// orange field (the UI accent), dark modules. Run with `npm run icons`.
import { writeFileSync, mkdirSync } from "node:fs";
import QRCode from "qrcode";

const outDir = new URL("../public/icons/", import.meta.url);
mkdirSync(outDir, { recursive: true });

for (const size of [192, 512]) {
  const url = await QRCode.toDataURL("DECIMEN OPTICAL TRANSFER", {
    width: size,
    margin: 6,
    errorCorrectionLevel: "M",
    color: { dark: "#121009", light: "#ffb257" },
  });
  const png = Buffer.from(url.split(",")[1], "base64");
  writeFileSync(new URL(`icon-${size}.png`, outDir), png);
  console.log(`icon-${size}.png (${png.length} bytes)`);
}
