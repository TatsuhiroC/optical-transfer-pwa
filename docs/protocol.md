# 传输原理与参数 / Protocol & settings

[简体中文首页](../README.md) · [English](../README_EN.md) · [开发与部署 / Development](development.md)

## 工作原理 / How it works

文件或文字装得进当前单码容量时，显示一张静态二维码；否则发送端将内容拆成数据块，使用 LT 喷泉码生成持续播放的动态二维码。每帧按序号和会话 ID 确定性选择数据块并异或。接收端允许丢帧、重复和乱序，收集足够的独立信息后还原文件并校验。

Content that fits the selected single-code capacity uses one static QR. Otherwise, the sender splits it into blocks and continuously displays LT fountain-coded QR frames. Each sequence number and session ID deterministically select the blocks to XOR. The receiver tolerates loss, duplicates and reordering, then reconstructs and verifies the file after collecting enough independent information.

所需帧数取决于生成的方程，约 `K × 1.18` 是估算，不保证任意一组帧都能解码。没有反馈通道，发送端不知道接收端何时完成。

About `K × 1.18` frames is an estimate, not a guarantee that every frame set decodes. There is no feedback channel; the sender cannot know when the receiver finishes.

帧头为 20 字节，当前格式额外包含 65 字节的文件名区域；文件名 UTF-8 字节最多 63。旧版不带文件名的帧仍可解析。具体实现见 [protocol.ts](../shared/protocol.ts) 和 [fountain.ts](../shared/fountain.ts)。

The header is 20 bytes; the current format adds a 65-byte filename area containing up to 63 UTF-8 bytes. Legacy frames without a filename still parse. See [protocol.ts](../shared/protocol.ts) and [fountain.ts](../shared/fountain.ts).

## 文字与文件 / Text and file identity

类型由发送入口决定：选择文件为 `0`（包括 TXT），输入或粘贴文字为 `1`。标识放在文件名区域最后一个原有的空闲字节（偏移 84），每帧均携带，不增加帧长度或缩短文件名；中途加入、丢帧、转发均保留类型。同一会话不得更改类型，未知值会被拒绝。

The source determines the kind: selecting a file uses `0` (including TXT); typing or pasting a message uses `1`. The flag reuses the last formerly unused byte of the filename area (offset 84) in every frame, without changing frame length or filename capacity. Late joins, frame loss and forwarding preserve the kind. A session cannot change kind; unknown values are rejected.

新接收端把没有标识的旧数据视为文件，不通过 `.txt` 扩展名猜测文字。旧接收端仍可解析新帧，但不会识别这个类型区别；两端更新后才能获得完整行为。

New receivers treat old unmarked data as files, without inferring messages from `.txt`. Older receivers still parse the new frames but do not recognize the distinction; update both ends for the complete behavior.

## 字节效率 / Byte efficiency

当前直接把二进制字节写入二维码，不经过 Base64、十六进制或 JSON。默认每帧 2431 字节包含 2346 字节内容和 85 字节帧头、名称及类型信息，应用帧内部的内容占约 96.50%；这不含二维码标准自身的纠错等开销。每帧保留文件参数和文件名，使接收端不依赖某个特定首帧。喷泉方程由会话 ID 和序号确定性重建，不另传源块索引列表。

QR frames carry binary bytes directly, without Base64, hex or JSON. The default 2431-byte frame carries 2346 content bytes and 85 bytes of header, name and kind metadata: about 96.50% content within the application frame, excluding QR-standard error correction and other QR overhead. Repeating metadata avoids dependence on a particular first frame. The session ID and sequence number reconstruct fountain equations without sending an additional list of source-block indices.

增加每帧容量不改变文件字节数，只会改变分帧数量和二维码密度；更小的格子可能降低手机识别成功率。当前不压缩传输内容。无损压缩需要比较完整压缩结果是否更小，并在接收端限制解压后的长度与资源消耗；短文本和已经压缩过的文件不保证获益。

Increasing frame capacity does not shrink files; it changes frame count and QR density, potentially making smaller modules harder for phones to read. Transfer content is currently uncompressed. Lossless compression would need to compare the complete compressed size and bound decoded length and resource usage on the receiver; short text and already compressed files are not guaranteed to benefit.

## 文件与资源上限 / File and resource limits

文件上限为 **64 MiB**（67,108,864 字节）。最多 65535 个源数据块，因此有效上限是 `min(64 MiB, 65535 × (bytes/frame − 85))`。发送端在读文件前检查大小，纠错等级限制可选择的单帧容量。

Files are capped at **64 MiB** (67,108,864 bytes). The 65535-block limit makes the effective cap `min(64 MiB, 65535 × (bytes/frame − 85))`. The sender checks size before reading; QR error correction constrains frame capacity.

解码状态预算为 128 MiB，每会话最多 `max(1024, 8 × K)` 个不同帧。该预算不等于总内存；文件拼装、预览和原生导出另需空间。同一会话的文件参数、校验值和名称必须一致，校验失败不能保存、分享或转发。

Decoder state has a 128 MiB budget and a `max(1024, 8 × K)` distinct-frame limit per session. Assembly, previews and native export require additional memory. Session geometry, checksum and name must agree; failed verification blocks export and forwarding.

## 校验与纠错 / Integrity and recovery

三层信息用途不同：每帧的 4 字节 FNV 值用于还原后的完整性核对，不能纠错；二维码标准的 Reed–Solomon 码修复一张码里的部分错误；喷泉码通过额外帧恢复漏掉的数据。喷泉码持续产生新帧，接收端信息足够且核对通过便完成；额外帧数不固定，也不保证固定百分比开销。

These layers serve different purposes: the per-frame 4-byte FNV value checks the reconstructed content but cannot repair it; QR-standard Reed–Solomon codes repair some errors within a symbol; fountain frames recover missing data across symbols. The receiver completes when enough information arrives and integrity passes; the number of extra frames and their overhead are not fixed.

2.0.6 把默认 L 级容量从 2331 增加至同一 V36 二维码能容纳的 2431 字节。格子数仍是 161 × 161，Reed–Solomon 纠错仍是 600 字节；每帧内容从 2246 增至 2346 字节，增加约 4.45%。这是用掉原有填充空间，不是减少纠错，也不是实测速度提升承诺。

Version 2.0.6 fills the same V36/L symbol from 2331 to its 2431-byte capacity. It retains 161 × 161 modules and 600 Reed–Solomon codewords; content per frame rises from 2246 to 2346 bytes, about 4.45%. This replaces unused padding, without reducing error correction or claiming a measured speed increase.

标准二维码仅提供 L/M/Q/H 四级纠错。现有会话要求数据块长度保持一致，改容量会重启会话。当前单向通道没有接收反馈，发送端无法自动判断对方需要更多还是更少冗余；不能把周期切换等级称为按接收质量自适应。

Standard QR provides four correction levels, L/M/Q/H. The current session requires consistent block lengths; capacity changes restart it. Without receiver feedback, the sender cannot determine how much redundancy the other device needs; cycling levels alone would not adapt to reception quality.

[二维码纠错说明 / QR error correction](https://www.qrcode.com/en/about/error_correction.html)

## 默认参数 / Defaults

| 设置 / Setting | 默认 / Default |
| --- | --- |
| 显示二维码 / Codes displayed | 1 |
| 发送帧率 / Sending cadence | 24 fps |
| 每帧字节 / Bytes per frame | 2431 |
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
