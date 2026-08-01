# DECIMEN Optical Transfer (PWA)

Send a file between two devices using nothing but a **screen and a camera** —
one device plays the file as an endless stream of fountain-coded animated QR
codes, the other points its camera at it and reconstructs the file. **No
network path between the devices, no pairing, no server.**

This is a PWA fork of
[decimen-optical-transfer](https://github.com/bashalarmistalt/decimen-optical-transfer)
(MIT) that merges the original separate `send`/`receive` pages into **one
installable app with both roles**, and lets the sender pick **any local file**
instead of the two bundled test images.

- **One app, two roles** — hash route `#/send` / `#/receive`, switch freely.
  A single device can't show codes and film them at once, so roles are
  exclusive per device: two devices, each running this app, screen to screen.
- **Any file** — file picker, photo/album picker (`accept="image/*"` opens
  the system photo library on phones), and drag & drop on desktop.
- **File name travels with the payload** — a fixed 64-byte name field rides
  in every frame (fountain frames arrive in any order, so a name in a "first"
  frame could be missing). The receiver shows the original name and offers
  **save / share / send-onward**, so a received file can be relayed to a
  third device with one tap. Legacy frames without a name field still parse.
- **PWA** — installable, offline after first visit, served from any static
  HTTPS host (camera needs a secure context).

Scan settings are unchanged from the original: capture width / fps / decode
worker count, `exact` fps demanded first (iOS lies with `ideal`), progress
tracked by frames collected (LT peeling back-loads).

## Try it

```bash
npm install
npm run dev        # https://localhost:5173 — pick a role
```

- **Send**: open the app, tap **Send a file**, choose a file (or drag it in,
  or pick from the photo library), max screen brightness, point it at the
  other device.
- **Receive**: tap **Receive → Start camera**, point at the sender's code.
  On completion: save, share, or send onward to a third device.

Two installed copies of the same PWA (one in each role) work fully offline.

### Protocol ceiling

`k` (block count) is a u16 — max ~65535 blocks. At 1465 B/frame that caps
files around **90 MB**; at the densest 2953 B/frame setting, ~190 MB. Larger
selections are rejected with a hint to raise bytes/frame or pick a smaller
file. `totalLen` is a u32 (4 GiB ceiling).

## Deploy

Static HTTPS hosting, e.g. GitHub Pages:

```bash
npm run build      # dist/ is fully self-contained (service worker included)
npm run icons      # regenerate the QR app icon if you change the brand text
```

Push `dist/` to the hosting branch and enable HTTPS — that's it. The service
worker precaches every asset; after the first visit the app runs offline and
both roles work without a network.

## How it works

See the original project's README for the full story: LT fountain codes
(each frame XORs a pseudorandom subset of blocks derived from its sequence
number — the receiver rebuilds from *any* ~K×1.18 distinct frames, dropped
frames cost time, never correctness), a 20-byte self-describing header with
no handshake, deterministic soliton distributions (the `Math.log` portability
trap), and zxing-wasm decoding in workers.

## License

MIT. Code derived from
[decimen-optical-transfer](https://github.com/bashalarmistalt/decimen-optical-transfer)
Copyright (c) 2026 BashAlarmist, with additions by TatsuhiroC.
