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
      registerType: "prompt",
      // Registration happens in src/main.ts instead of an injected script: the
      // service worker must stay off inside the Capacitor build (see main.ts).
      injectRegister: null,
      includeAssets: ["icons/*.png", "icons/*.svg"],
      manifest: {
        name: "光码互传 · Optical Transfer",
        short_name: "光码互传",
        description:
          "Send files between devices as fountain-coded animated QR codes — screen to camera, no network path.",
        theme_color: "#0b0e14",
        background_color: "#0b0e14",
        display: "standalone",
        start_url: "./",
        icons: [
          { src: "./icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "./icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "./icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  build: {
    target: "es2022",
  },
  server: { host: true },
});
