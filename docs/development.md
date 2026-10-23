# 开发与部署 / Development & deployment

[简体中文首页](../README.md) · [English](../README_EN.md) · [传输原理 / Protocol](protocol.md)

## 本地开发 / Local development

需要 Node.js `^20.19.0` 或 `>=22.12.0`。仓库包含 npm 锁文件，推荐使用 `npm ci`。

Use Node.js `^20.19.0` or `>=22.12.0`. Install the locked dependency tree with `npm ci`.

```bash
npm ci
npm run dev
npm test
npm run build
```

开发服务器使用 HTTPS，接收端摄像头需要安全环境。生产构建输出到 `dist/`。

The development server uses HTTPS because camera access requires a secure context. Production assets are built into `dist/`.

## 网页部署 / Web deployment

GitHub Pages 使用 [deploy-pages.yml](../.github/workflows/deploy-pages.yml) 发布：安装依赖、测试、构建，然后上传 `dist/`。GitHub 的 Pages 设置应选择 **GitHub Actions**。

GitHub Pages is published by [deploy-pages.yml](../.github/workflows/deploy-pages.yml) after install, tests and build. Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**.

[ci.yml](../.github/workflows/ci.yml) 检查 Pull Request。其他静态 HTTPS 托管也可以直接部署 `dist/`。

[ci.yml](../.github/workflows/ci.yml) checks pull requests. Any other static HTTPS host can also serve `dist/`.

网页更新会显示按钮，传输期间禁止刷新；更新会清除当前内存中的文件。APK 不注册网页 Service Worker，直接使用包内资源。

Web updates require clicking the update button; active transfers block refresh. Updating clears in-memory files. The APK uses its bundled resources without registering a web service worker.

## Android 构建 / Android builds

APK 通过 Capacitor 包装同一份网页资源。[build-apk.yml](../.github/workflows/build-apk.yml) 在 CI 中生成 Android 工程；生成目录不提交到 Git。

Capacitor packages the same web assets into the APK. [build-apk.yml](../.github/workflows/build-apk.yml) generates the Android project in CI; that directory is not committed.

本地需要 Java 21、Android SDK 与 platform 36。以下路径仅为示例，按本机安装位置调整。

Local builds need Java 21, the Android SDK and platform 36. Adjust the example paths for your installation.

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
export ANDROID_HOME=$HOME/android-sdk
npm run android:sync
npm run android:apk
```

本地调试包输出到 `android/app/build/outputs/apk/debug/app-debug.apk`。开发包名包含版本、开发标识与签名模式；正式标签发布使用 `optical-transfer-<version>.apk`。

The local debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. CI development filenames identify the version and signing mode; tagged releases use `optical-transfer-<version>.apk`.

## 正式签名 / Release signing

正式版本继续使用之前发布 APK 的签名密钥。请安全备份密钥及密码；新密钥不能用于覆盖升级旧密钥签名的安装。

Keep using the key that signed previously published APKs. Back up the key and passwords securely; a different key cannot update an existing installation signed by the original key.

在 GitHub **Settings → Secrets and variables → Actions** 配置以下 repository secrets；不要把这些值写进源码、README 或构建日志。

Configure these repository secrets in **Settings → Secrets and variables → Actions**. Keep their values out of source files, documentation and build logs.

| Secret | 内容 / Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Keystore 的单行 Base64 / Keystore encoded as single-line Base64 |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore 密码 / Keystore password |
| `ANDROID_KEY_ALIAS` | 密钥别名 / Key alias |
| `ANDROID_KEY_PASSWORD` | 密钥密码 / Key password |
| `ANDROID_CERT_SHA256`（release 必填 / required for release） | 预期证书 SHA-256，带冒号 / Expected certificate SHA-256, with colons |

生成工具适用于 macOS / Linux，要求 Node.js 和 Java 21。仅为新项目生成密钥；已发布的应用继续使用已有正式密钥。默认目录为 `~/.optical-transfer-pwa/`，自定义输出目录必须归当前用户所有且权限为 700。

The generator runs on macOS / Linux with Node.js and Java 21. Generate a key only for a new signing identity; existing releases keep their original key. The default directory is `~/.optical-transfer-pwa/`; custom directories must be owned by the current user with mode 700.

```bash
npm run android:keystore
```

工具将 keystore 与 `release.keystore.secrets.json` 保存为 600 权限文件，仅输出路径和公开证书指纹。JSON 包含签名材料与密码，请与 keystore 一起私密备份；不要提交到 Git。现有文件不会被覆盖。

The tool writes the keystore and `release.keystore.secrets.json` with mode 600 and prints only paths and the public certificate fingerprint. The JSON contains signing material and passwords: back up both files privately and keep them out of Git. Existing files are never overwritten.

如需配置 GitHub，使用已有的私有配置文件显式运行以下命令。它通过标准输入传递五个 Secret，不会生成或更换密钥，也不会打印这些值；可用 `--repo owner/repo` 指定 fork。

To configure GitHub, explicitly run the following command with an existing private configuration. It sends five secrets on stdin without generating/replacing a key or printing values. Use `--repo owner/repo` for a fork.

需要已安装并登录 GitHub CLI，且当前账号有目标仓库的 Secret 管理权限。

GitHub CLI must be installed and signed in with permission to manage secrets in the target repository.

```bash
node scripts/make-keystore.mjs --configure-github ~/.optical-transfer-pwa/release.keystore.secrets.json
```

构建准备脚本也会用新的 600 权限文件替换旧签名配置，避免继承宽松权限或沿符号链接写入。

Build preparation replaces signing files with fresh mode-600 files instead of inheriting old permissions or writing through symlinks.

正式发布要求四个签名 Secret 和 ANDROID_CERT_SHA256 证书指纹齐全，否则失败。分支缺少签名配置时可构建 debug 包；不同 runner 生成的 debug 签名可能无法相互覆盖升级。

Release builds require all four signing secrets and the pinned ANDROID_CERT_SHA256 certificate fingerprint. Branch builds without signing configuration can produce debug APKs, whose runner-generated signatures may differ between builds.

版本名取自 `package.json` 或正式标签；CI 的版本号使用 `100000000 + GITHUB_RUN_NUMBER`。本地可设置 `ANDROID_VERSION_CODE`。

Version names come from `package.json` or the release tag. CI uses `100000000 + GITHUB_RUN_NUMBER` for `versionCode`; local builds can set `ANDROID_VERSION_CODE`.

## 图标 / Icons

PWA、Apple 主屏幕和 Android 图标共用 [brand-mark.svg](../resources/brand-mark.svg)。

PWA, Apple home-screen and Android icons share [brand-mark.svg](../resources/brand-mark.svg).

```bash
npm run icons
```

生成器会更新 Apple 图标的内容哈希 URL，并保留常规入口。既有快捷方式可能保留旧图标，需要移除后重新添加。

The generator updates the Apple icon’s content-hashed URL and preserves conventional entry points. Existing shortcuts may retain the old icon until removed and added again.

## README 展示图 / README screenshots

`assets/home-zh.jpg` 和 `assets/home-en.jpg` 来自当前应用的真实桌面首页。更新界面时，请分别切换语言后重新截取，避免使用含个人相机画面、文件名或敏感数据的截图。

`assets/home-zh.jpg` and `assets/home-en.jpg` show the real desktop home page. Refresh both language versions after UI changes and avoid personal camera images, filenames or sensitive data.
