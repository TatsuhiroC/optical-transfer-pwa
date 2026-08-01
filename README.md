# DECIMEN Optical Transfer (PWA)

Send a file between two devices using nothing but a **screen and a camera** —
one device plays the file as an endless stream of fountain-coded animated QR
codes, the other points its camera at it and reconstructs the file. **No
network path between the devices, no pairing, no server.**

在**屏幕和摄像头**之间传文件：一台设备把文件变成源源不断的喷泉码动态
QR 码流，另一台用摄像头对准屏幕，即可还原文件。**两台设备之间没有任何
网络路径，无需配对，无需服务器。**


**This repo's live instance / 本仓库线上实例:**
** <https://tatsuhiroc.github.io/optical-transfer-pwa/> **


> This is a PWA fork of
> [decimen-optical-transfer](https://github.com/bashalarmistalt/decimen-optical-transfer)
> (MIT) that merges the original separate `send`/`receive` pages into **one
> installable app with both roles**, and lets the sender pick **any local file**
> instead of the two bundled test images.

> 本项目是 [decimen-optical-transfer](https://github.com/bashalarmistalt/decimen-optical-transfer)
> (MIT) 的 PWA 版本：把原版分离的 `send`/`receive` 两个页面合并成**一个可
> 安装、同时具备发送与接收两种角色的应用**，发送端也改为可以**选择任意本地
> 文件**，而非原版内置的两张测试图片。

## Features / 功能

- **One app, two roles** — hash route `#/send` / `#/receive`, switch freely.
  A single device can't show codes and film them at once, so roles are
  exclusive per device: two devices, each running this app, screen to screen.
  **一个应用，两种角色**：`#/send` / `#/receive` 随时切换。一台设备无法
  同时播放二维码又拍摄二维码（屏幕与摄像头同侧），因此每台设备一次扮演
  一个角色：两台设备各装一份，屏幕对屏幕。
- **Any file** — file picker, photo/album picker (`accept="image/*"` opens
  the system photo library on phones), and drag & drop on desktop.
  **任意文件**：文件选择器、相册/图库选择（手机上 `accept="image/*"` 会
  打开系统相册）、桌面端支持拖放。
- **File name travels with the payload** — a fixed 64-byte name field rides
  in every frame (fountain frames arrive in any order, so a name in a "first"
  frame could be missing). The receiver shows the original name and offers
  **save / share / send-onward**, so a received file can be relayed to a
  third device with one tap. Legacy frames without a name field still parse.
  **文件名随帧传输**：每帧携带定长 64 字节名字字段（喷泉码帧乱序到达，
  名字写在"第一帧"上可能会丢失，因此必须每帧都带）。接收端显示原文件名，
  并提供**保存 / 分享 / 转发**——收到的文件一键中继给第三台设备。不带
  名字字段的原版帧仍可解析。
- **PWA** — installable, offline after first visit, served from any static
  HTTPS host (camera needs a secure context).
  **PWA**：可安装、首次访问后完全离线、可部署到任意静态 HTTPS 托管
  （摄像头 API 要求安全上下文）。
- **Bilingual UI** — 中文 / English switch in the top bar, persisted.
  **双语界面**：顶栏一键切换中 / 英文，选择会记住。
- **File type safety net** — the receiver sniffs magic bytes, so even a
  stream without a name (legacy frames) saves with the right extension: a
  WAV that arrives as "received" lands as `received.wav`, never extensionless.
  **文件类型兜底**：接收端会嗅探文件魔数，即使数据流没有文件名（旧版
  帧）也能带上正确扩展名——比如 WAV 传过来显示为 `received.wav`，绝不会
  变成无后缀文件。

Scan settings are unchanged from the original: capture width / fps / decode
worker count, `exact` fps demanded first (iOS lies with `ideal`), progress
tracked by frames collected (LT peeling back-loads).

扫码设置与原版完全一致：采集宽度 / 采集 fps / 解码 worker 数量、优先以
`exact` 请求 fps（iOS 对 `ideal` 会阳奉阴违）、进度按已收集帧数统计
（LT 剥皮解码结果集中在后期爆发）。

## Try it / 使用

```bash
npm install
npm run dev        # https://localhost:5173 — pick a role / 选择角色
```

- **Send / 发送**: open the app, tap **Send a file**, choose a file (or drag
  it in, or pick from the photo library), max screen brightness, point it at
  the other device.
  打开应用 → **Send a file** → 选择文件（或拖入、或从相册选）→ 屏幕调到
  最大亮度 → 对准另一台设备。
- **Receive / 接收**: tap **Receive → Start camera**, point at the sender's
  code. On completion: save, share, or send onward to a third device.
  点击 **Receive → Start camera**，对准发送端的二维码。完成后可保存、分享
  或转发给第三台设备。

Two installed copies of the same PWA (one in each role) work fully offline.

同一份 PWA 装两台设备（各扮演一个角色），完全离线可用。

### Protocol ceiling / 协议上限

`k` (block count) is a u16 — max ~65535 blocks. At 1465 B/frame that caps
files around **90 MB**; at the densest 2953 B/frame setting, ~190 MB. Larger
selections are rejected with a hint to raise bytes/frame or pick a smaller
file. `totalLen` is a u32 (4 GiB ceiling).

`k`（分块数）是 u16，最多约 65535 块。按 1465 B/帧计算，文件上限约
**90 MB**；用最密的 2953 B/帧设置约为 190 MB。超限时会被拒绝，并提示调大
bytes/frame 或换小文件。`totalLen` 是 u32（4 GiB 上限）。

## Deploy / 部署

Static HTTPS hosting, e.g. GitHub Pages:

静态 HTTPS 托管即可，例如 GitHub Pages：

```bash
npm run build      # dist/ is fully self-contained (service worker included)
npm run icons      # regenerate the QR app icon if you change the brand text
```

Push `dist/` to the hosting branch and enable HTTPS — that's it. The service
worker precaches every asset; after the first visit the app runs offline and
both roles work without a network.

把 `dist/` 推到托管分支并开启 HTTPS 即可。Service Worker 预缓存了所有
资源，首次访问后应用离线可用，两种角色都不依赖网络。

**This repo's live instance / 本仓库线上实例:**
<https://tatsuhiroc.github.io/optical-transfer-pwa/>

## How it works / 工作原理

See the original project's README for the full story: LT fountain codes
(each frame XORs a pseudorandom subset of blocks derived from its sequence
number — the receiver rebuilds from *any* ~K×1.18 distinct frames, dropped
frames cost time, never correctness), a 20-byte self-describing header with
no handshake, deterministic soliton distributions (the `Math.log` portability
trap), and zxing-wasm decoding in workers.

完整原理见原项目 README：LT 喷泉码（每帧是对由序列号确定的伪随机块子集做
异或——接收端从*任意*约 K×1.18 个不同帧即可重建，丢帧只损失时间、不损失
正确性）、20 字节自描述帧头、无握手、确定性孤立子分布（`Math.log` 跨引擎
一致性的坑）、worker 里的 zxing-wasm 解码。

## License / 许可证

MIT. Code derived from
[decimen-optical-transfer](https://github.com/bashalarmistalt/decimen-optical-transfer)
Copyright (c) 2026 BashAlarmist, with additions by TatsuhiroC.

MIT。代码衍生自
[decimen-optical-transfer](https://github.com/bashalarmistalt/decimen-optical-transfer)
Copyright (c) 2026 BashAlarmist，由 TatsuhiroC 增补。
