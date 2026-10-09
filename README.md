# DECIMEN Optical Transfer (PWA)

Send a file between two devices using nothing but a **screen and a camera** —
one device plays the file as an endless stream of fountain-coded animated QR
codes, the other points its camera at it and reconstructs the file. **No
network path between the devices, no pairing, no server.**

在**屏幕和摄像头**之间传文件：一台设备把文件变成源源不断的喷泉码动态
QR 码流，另一台用摄像头对准屏幕，即可还原文件。**两台设备之间没有任何
网络路径，无需配对，无需服务器。**




**This repo's live instance / 本仓库线上实例:**

[**▶ 打开 Optical Transfer / Open Optical Transfer**](https://tatsuhiroc.github.io/optical-transfer-pwa)






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

- **Crafted streams are refused** — every frame carries its own header, so the
  receiver validates it against what a real sender can emit (block count,
  bytes per frame, declared length) before allocating anything for it: a
  hand-made code claiming a 4 GiB file is dropped, never hashed.
  **拒绝伪造流**：每帧都自带帧头，接收端会在分配内存之前先校验它是否是真实
  发送端可能产生的值（块数、每帧字节数、声明长度）——手工构造、声称 4 GiB
  的码会被直接丢弃，而不是被哈希。

Scan settings are unchanged from the original: capture width / fps / decode
worker count, `exact` fps demanded first (iOS lies with `ideal`), progress
tracked by frames collected (LT peeling back-loads).

扫码设置与原版完全一致：采集宽度 / 采集 fps / 解码 worker 数量、优先以
`exact` 请求 fps（iOS 对 `ideal` 会阳奉阴违）、进度按已收集帧数统计
（LT 剥皮解码结果集中在后期爆发）。

## Try it / 使用

```bash
npm install        # Node ^20.19 || >=22.12 (vite 8) / 需要 Node ^20.19 或 >=22.12
npm run dev        # https://localhost:5173 — pick a role / 选择角色
npm test           # protocol + LT fountain code unit tests / 协议与喷泉码单测
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

## Android APK / 安卓安装包

The current app version is **2.0.3**. APK filenames include the embedded
app version and signing mode, such as `optical-transfer-2.0.3-dev.9+abcdef0-release.apk`
for an Actions build or `optical-transfer-2.0.3.apk` for a signed tagged release.

当前应用版本为 **2.0.3**。APK 文件名包含实际应用版本与签名类型；
Actions 开发包保留 `dev` 标识，正式标签发布为 `optical-transfer-2.0.3.apk`。

Icons share the vector source `resources/brand-mark.svg`. Run `npm run icons` to
regenerate PWA, Apple touch, Android adaptive and monochrome icons. Existing home
screen shortcuts may retain their old icon; after updating the web app, remove the
old shortcut and add it again if needed.

PWA、iPhone 桌面和 Android 图标共用 `resources/brand-mark.svg`，运行 `npm run icons`
可重新生成。若已添加的桌面快捷方式仍显示旧图标，更新网页后移除旧快捷方式，再添加一次。

Download the latest APK from [Releases](https://github.com/TatsuhiroC/optical-transfer-pwa/releases)
(or `Actions → Build Android APK → Artifacts` for a dev build) and install it —
the web bundle, WASM and icons are all inside the APK, so the app never needs a
network. Android will ask for camera permission the first time you start the
receive role; the send role works without a camera.

从 [Releases](https://github.com/TatsuhiroC/optical-transfer-pwa/releases) 下载最新
APK（开发版见 `Actions → Build Android APK → Artifacts`）直接安装即可——网页包、
WASM、图标全部打包在 APK 内，完全不需要联网。首次使用"接收"时会请求摄像头权限；
"发送"角色没有摄像头也能用。

The APK is a [Capacitor](https://capacitorjs.com) wrapper around `dist/`. The
Gradle project is **not** committed: [build-apk.yml](.github/workflows/build-apk.yml)
runs `npx cap add android` on every build, so the Android tree can never drift from
the web build it wraps. Locally:

APK 是用 [Capacitor](https://capacitorjs.com) 包住 `dist/`。Gradle 工程**不进版本库**：
[build-apk.yml](.github/workflows/build-apk.yml) 每次构建都重新 `npx cap add android`，
所以安卓工程不可能和网页构建脱节。本地构建：

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 21)   # or: /opt/homebrew/opt/openjdk@21
export ANDROID_HOME=$HOME/android-sdk              # needs platform-tools + platform 36
npm run android:sync                               # build, create project if absent, prepare permissions/icons, sync
npm run android:apk                                # → android/app/build/outputs/apk/debug/app-debug.apk
```

### APK signing / APK 签名

APKs are signed with a keystore kept in GitHub Secrets, so each release installs
**over** the previous one. Add these four secrets under **Settings → Secrets and
variables → Actions** (or run `bash scripts/make-keystore.sh`, which generates the
keystore and prints every value):

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `base64 < release.keystore` on a single line |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | key alias |
| `ANDROID_KEY_PASSWORD` | key password |

Optionally set `ANDROID_CERT_SHA256` to the keystore's SHA-256 fingerprint (colons
included) and CI will refuse to publish an APK signed with anything else.

Keep the keystore file itself backed up: if it is lost, existing installs can only
be updated by uninstalling the app first. Without the secrets the workflow still
can produce a **debug** APK for branch builds — every runner generates a fresh debug key,
so users have to uninstall before installing the next build.

---

APK 使用保存在 GitHub Secrets 里的 keystore 签名，因此新版本可以直接覆盖安装旧版本。
在 **Settings → Secrets and variables → Actions** 里添加以下四个 secret（也可以直接
运行 `bash scripts/make-keystore.sh`，它会生成 keystore 并打印所有需要填的值）：
表格同上。可选：把 keystore 的 SHA-256 指纹（带冒号）填到 `ANDROID_CERT_SHA256`，
CI 就会拒绝发布用其他密钥签名的 APK。

请务必备份 keystore 文件本身：一旦丢失，已安装的用户只能先卸载才能升级。没有配置这些
secret 时分支构建会退回到 **debug** APK——每个 runner 都会重新生成一个
debug 密钥，用户必须先卸载才能安装下一个版本。

### Protocol ceiling / 协议上限

The app accepts files up to **64 MiB** (67,108,864 bytes), and checks the file
size before reading it into memory. The protocol additionally caps `k` at 65535
source blocks: the effective limit is the smaller of 64 MiB and
`65535 * (bytes/frame - 85)`. Error correction constrains the frame capacity;
unavailable byte presets are disabled and a lower valid preset is selected.

本应用文件大小上限为 **64 MiB**（67,108,864 字节），读取文件前检查大小。
协议还限制最多 65535 个源数据块，实际限制是 64 MiB 与
`65535 * (每帧字节数 - 85)` 中较小的值。纠错等级会限制二维码容量，界面会禁用
超过容量的字节数选项，并自动选取较小的有效值。

The decoder has a conservative 128 MiB state budget and accepts at most
`max(1024, 8*K)` distinct frames per session. These limits do not measure the
browser's total heap: payload assembly, image preview and native export need
additional working memory. A stalled transfer with no fresh frames for 60 seconds
stops with a restart prompt. Frames in a session must agree on file geometry,
checksum and file name. A checksum mismatch cannot be saved, shared or forwarded.

解码状态采用保守的 128 MiB 内存预算，每个会话最多接收 `max(1024, 8*K)` 个不同帧。
该预算不等于浏览器总内存，文件拼装、图片预览和原生导出仍需要额外工作空间。
连续 60 秒没有新帧时停止并提示重试。同一会话的文件参数、摘要和名字必须一致；
校验失败的文件不能保存、分享或转发。

### Scanning and display cadence / 扫描与显示节奏

The sender still defaults to **one QR code at 24 fps**. The 30 fps option is
available for device pairs that can receive it reliably; raising the default
requires physical phone tests. Each code is kept for at least two animation
callbacks, and long rendering delays restart the schedule instead of flashing
through overdue codes. Faster selections are thus bounded by the actual browser
callback rate. The sender reports codes actually displayed and measured display
fps, rather than counting the lookahead queue or promising an ideal duration.

发送端仍默认 **单二维码、24 fps**。设备组合能稳定识别时可手动选择 30 fps；
提高默认值需要手机实拍验证。每码至少间隔两个绘制回调，长时间卡顿后重新安排
节奏，避免追赶旧进度时快速闪码。实际显示速度还受到浏览器回调频率限制。
发送计数按实际显示计算，并显示实测帧率，预生成队列不再算作已经发送。

Receiver workers automatically track the last valid transfer QR's position at
original pixel resolution. They retain ZXing's robust search defaults and full
capture buffers: a missed/incomplete local scan retries the **same full capture**.
Each worker also searches the full image every eight jobs or after 500 ms,
whichever comes first on the next job, to discover movement and additional codes.
Repeated tracking failures cause a 500 ms backoff to full-image scanning.
Disable **Auto-track light codes** in camera settings to compare with the original
full-image scanner. Progress renders at 5 Hz; duplicates do not redraw progress.
New metrics show recent average scan time and the percentage of available camera
frames skipped while all workers were busy (including warmup).

接收线程会追踪合法光码的位置，按原像素清晰度扫描附近区域，并保留稳健识别选项。
局部扫描失败或识别数量减少时，用 **同一张完整画面** 重试。每个线程每八次扫描，
或距离上次全图扫描超过 500 毫秒时，在下一次任务重新搜索全图。连续失败后暂时
使用全图扫描 500 毫秒。摄像头设置中可关闭“自动追踪光码”，用于对照原来的扫描方式。
进度每秒更新五次，重复帧不重绘进度；新增识别耗时与忙碌时跳过画面的比例，后者包含启动阶段。

The wire format, QR error correction, fountain algorithm and final file checksum
are unchanged. Synthetic QR/WASM and browser worker checks cover movement, loss,
rotation and recovery; they do not establish screen-camera throughput or exposure
tolerance on real phones. More stable software pacing cannot infer the remote
camera's exposure or automatically choose its best sending rate.

传输格式、二维码纠错、喷泉编码和最终文件校验保持兼容。合成二维码与浏览器线程
验证覆盖了移动、丢帧、旋转和恢复，但手机上的速度与曝光容忍度仍需实拍确认。
稳定显示节奏无法代替接收端反馈，也不能自动判断另一台手机最适合的发送帧率。

### Updates, signing and version codes / 更新、签名与版本号

Web updates are shown as an explicit update button; active transfers prevent
refreshing. Updating clears the current in-memory files, as stated on the button.
Android sharing uses a temporary cache file and retains its `file://` URI.

网页新版本需要点击更新按钮，传输过程中不能刷新；更新会清除当前内存中的文件，
按钮会明确说明。Android 分享使用临时缓存文件，并保留 `file://` 地址。

Tagged releases require all four signing secrets and fail instead of publishing
a debug-signed APK. Both branch and tag builds use `100000000 + GITHUB_RUN_NUMBER`
as `versionCode`, preserving an increasing sequence above earlier version codes.
Local builds may set `ANDROID_VERSION_CODE` explicitly. Regenerating the project
updates the injected configuration rather than leaving stale signing/version data.
Keep the signing key used by previously published APKs.

正式版本标签构建必须有四个签名 Secret，否则失败；不会发布临时 debug 密钥签名的正式包。
分支和标签统一使用 `100000000 + GITHUB_RUN_NUMBER`，避免开发版和正式版升级时版本号倒退。
本地构建可显式设置 `ANDROID_VERSION_CODE`。重复准备工程会更新版本和签名配置。
请保留之前已发布 APK 的签名密钥。

File data is transmitted in plaintext over the optical channel. FNV detects
accidental corruption; it does not authenticate the sender. This application does
not currently encrypt files.

文件通过光学通道明文传输，FNV 检测偶然的数据错误，不能认证发送者身份。目前未加密文件。

## Deploy / 部署

GitHub Pages is published on every push to `main` by
[deploy-pages.yml](.github/workflows/deploy-pages.yml) — `npm ci`, `npm test`,
`npm run build`, then `actions/deploy-pages` uploads `dist/`. No build output
is committed to a deploy branch any more; [ci.yml](.github/workflows/ci.yml)
runs the same tests on pull requests.

GitHub Pages 由 [deploy-pages.yml](.github/workflows/deploy-pages.yml) 在每次
推送到 `main` 时发布：`npm ci` → `npm test` → `npm run build`，再由
`actions/deploy-pages` 上传 `dist/`。构建产物不再提交到发布分支；PR 由
[ci.yml](.github/workflows/ci.yml) 跑同样的测试。

One-time setup / 一次性设置: **Settings → Pages → Build and deployment →
Source: GitHub Actions**, or

```bash
gh api -X PUT repos/TatsuhiroC/optical-transfer-pwa/pages -f build_type=workflow
```

Until that is done the workflow fails at `configure-pages` and the site keeps
serving the retired `gh-pages` branch, which can be deleted once the first
Actions deploy is green:

```bash
gh api -X DELETE repos/TatsuhiroC/optical-transfer-pwa/git/refs/heads/gh-pages
```

没做这一步之前 workflow 会在 `configure-pages` 失败，站点继续由已退役的
`gh-pages` 分支提供；第一次 Actions 部署成功后即可删除该分支（命令同上）。

Any other static HTTPS host works too: `dist/` is fully self-contained (service
worker included), and `npm run icons` regenerates the QR app icon if you change
the brand text. The service worker precaches every asset, so after the first
visit the app runs offline and both roles work without a network.

其他静态 HTTPS 托管同样可用：`dist/` 完全自包含（含 Service Worker）；改了
品牌文字后用 `npm run icons` 重新生成二维码图标。Service Worker 预缓存了所有
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
