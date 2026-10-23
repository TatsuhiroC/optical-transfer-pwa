# 传输原理与参数 / Protocol & settings

[简体中文首页](../README.md) · [English](../README_EN.md) · [开发与部署 / Development](development.md)

## 工作原理 / How it works

发送端将文件拆成数据块，使用 LT 喷泉码生成持续播放的动态二维码。每帧按序号和会话 ID 确定性选择数据块并异或。接收端允许丢帧、重复和乱序，收集足够的独立信息后还原文件并校验。

The sender splits the file into blocks and continuously displays LT fountain-coded QR frames. Each sequence number and session ID deterministically select the blocks to XOR. The receiver tolerates loss, duplicates and reordering, then reconstructs and verifies the file after collecting enough independent information.

所需帧数取决于生成的方程，约 `K × 1.18` 是估算，不保证任意一组帧都能解码。没有反馈通道，发送端不知道接收端何时完成。

About `K × 1.18` frames is an estimate, not a guarantee that every frame set decodes. There is no feedback channel; the sender cannot know when the receiver finishes.

帧头为 20 字节，当前格式额外包含 65 字节的文件名区域；文件名 UTF-8 字节最多 63。旧版不带文件名的帧仍可解析。具体实现见 [protocol.ts](../shared/protocol.ts) 和 [fountain.ts](../shared/fountain.ts)。

The header is 20 bytes; the current format adds a 65-byte filename area containing up to 63 UTF-8 bytes. Legacy frames without a filename still parse. See [protocol.ts](../shared/protocol.ts) and [fountain.ts](../shared/fountain.ts).

## 文件与资源上限 / File and resource limits

文件上限为 **64 MiB**（67,108,864 字节）。最多 65535 个源数据块，因此有效上限是 `min(64 MiB, 65535 × (bytes/frame − 85))`。发送端在读文件前检查大小，纠错等级限制可选择的单帧容量。

Files are capped at **64 MiB** (67,108,864 bytes). The 65535-block limit makes the effective cap `min(64 MiB, 65535 × (bytes/frame − 85))`. The sender checks size before reading; QR error correction constrains frame capacity.

解码状态预算为 128 MiB，每会话最多 `max(1024, 8 × K)` 个不同帧。该预算不等于总内存；文件拼装、预览和原生导出另需空间。同一会话的文件参数、校验值和名称必须一致，校验失败不能保存、分享或转发。

Decoder state has a 128 MiB budget and a `max(1024, 8 × K)` distinct-frame limit per session. Assembly, previews and native export require additional memory. Session geometry, checksum and name must agree; failed verification blocks export and forwarding.

## 默认参数 / Defaults

| 设置 / Setting | 默认 / Default |
| --- | --- |
| 显示二维码 / Codes displayed | 1 |
| 发送帧率 / Sending cadence | 24 fps |
| 每帧字节 / Bytes per frame | 2331 |
| 纠错等级 / Error correction | L |
| 采集宽度 / Capture width | 1280 px |
| 请求摄像头帧率 / Requested camera rate | 60 fps，设备可能回退 / fallback may apply |
| 解码线程 / Decode workers | 2 |
| 自动追踪光码 / QR tracking | 开启 / Enabled |

修改发送参数会开启新会话，接收进度重置。30 fps 适用于能稳定识别的设备组合；高帧率选项还受浏览器实际绘制回调频率限制，每码至少间隔两个回调。发送统计按实际显示计算，不将预生成队列算作已发送。

Changing sender settings starts a new session and resets receiver progress. Try 30 fps only on device pairs that decode reliably. Higher settings are limited by browser rendering cadence, with at least two callbacks between displayed codes. Counts represent actual displays, not queued frames.

## 识别与进度 / Scanning and progress

二维码识别由 ZXing-C++ WebAssembly 在 Worker 中执行。线程追踪合法光码的位置，按原像素扫描附近区域；局部失败时用同一张完整画面重试，每八次任务或超过 500 ms 时重新搜索全图。连续失败后退回全图识别 500 ms。

Workers use ZXing-C++ WebAssembly. They track valid transfer codes at original resolution, retry failed local scans against the same full capture, and periodically search the whole image after eight jobs or 500 ms. Repeated misses trigger a 500 ms full-image backoff.

进度每秒更新五次，重复帧不重绘。诊断面板显示识别耗时和线程忙碌时跳过画面的比例；软件与合成二维码测试不能代替真实屏幕、摄像头和光照下的速度测量。

Progress updates five times per second and ignores duplicate-frame redraws. Diagnostics show scan duration and frames skipped while workers are busy. Software and synthetic QR tests do not establish real screen-to-camera throughput.

## 数据保护 / Data protection

文件不上传服务器，但光学通道为明文。FNV 用于检测意外传输错误，不是加密或发送者身份认证。

Files are not uploaded to a server, but optical frames contain plaintext. FNV detects accidental corruption; it does not encrypt data or authenticate the sender.
