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
| `ANDROID_CERT_SHA256`（可选 / optional） | 预期证书 SHA-256，带冒号 / Expected certificate SHA-256, with colons |

当前 `scripts/make-keystore.sh` 会打印新密钥与密码。已有正式签名应复用原密钥；生成工具的安全处理是单独的维护事项。

The current `scripts/make-keystore.sh` prints generated key material and passwords. Existing releases should reuse their original key; hardening that helper is a separate maintenance task.

正式标签构建要求四个签名 Secret 齐全，否则失败。分支缺少签名配置时可构建 debug 包；不同 runner 生成的 debug 签名可能无法相互覆盖升级。

Tagged builds require all four signing secrets. Branch builds without signing configuration can produce debug APKs, whose runner-generated signatures may differ between builds.

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
