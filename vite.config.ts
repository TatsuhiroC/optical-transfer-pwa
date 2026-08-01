import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { VitePWA } from "vite-plugin-pwa";

// HTTPS for dev (camera needs a secure context), PWA for production: the
// built app is a fully static, installable, offline-capable site that can be
// dropped on any static HTTPS host — no dev server, no self-signed certs, no
// LAN IP needed for the receiving device.
export default defineConfig({
  base: "./",
  plugins: [
    basicSsl(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "DECIMEN Optical Transfer",
        short_name: "OptTransfer",
        description:
          "Send files between devices as fountain-coded animated QR codes — screen to camera, no network path.",
        theme_color: "#121009",
        background_color: "#121009",
        display: "standalone",
        start_url: "./",
        icons: [
          { src: "./icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "./icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ],
  build: {
    target: "es2022",
  },
  server: { host: true },
});
