<div align="center">
  <img src="public/icons/icon-192.png" width="88" height="88" alt="Optical Transfer">
  <h1>Optical Transfer</h1>
  <p>Send files and words with a screen and a camera.</p>
  <p>
    <a href="https://tatsuhiroc.github.io/optical-transfer-pwa/"><img src="https://img.shields.io/badge/Web-Open_app-ff9385?style=flat-square&amp;labelColor=1d2430&amp;logo=googlechrome&amp;logoColor=white" alt="Open web app"></a>
    <a href="https://github.com/TatsuhiroC/optical-transfer-pwa/releases/latest"><img src="https://img.shields.io/badge/Android-Download_APK-8be0b2?style=flat-square&amp;labelColor=1d2430&amp;logo=android&amp;logoColor=white" alt="Download APK"></a>
  </p>
  <p>
    <a href="https://github.com/TatsuhiroC/optical-transfer-pwa/releases/latest"><img src="https://img.shields.io/github/v/release/TatsuhiroC/optical-transfer-pwa?style=flat-square&amp;labelColor=1d2430&amp;color=ff9385" alt="Latest release"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-8be0b2?style=flat-square&amp;labelColor=1d2430" alt="MIT"></a>
  </p>
  <p><a href="README.md">简体中文</a> · <a href="README_EN.md">English</a> · <a href="https://github.com/TatsuhiroC/optical-transfer-pwa/issues">Feedback</a></p>
</div>

Transfer photos, files and text between phones and computers using a screen and a camera. **No account, no pairing, no server uploads.** The devices do not need to share a Wi-Fi network.

![Optical Transfer desktop home with send, receive and invitation controls](docs/assets/home-en.jpg)

## What makes it useful

- **Files and messages stay distinct**: choose photos, drag in a file, or type and paste up to 4 MiB of text. Messages can be copied directly; TXT documents remain files.
- **One code for small content**: use a static QR when everything fits; larger content switches to fountain-coded animated QR frames.
- **Tolerates missed scans, verifies before export**: animated transfers handle missing, duplicate and reordered frames. Export becomes available after enough data arrives and the integrity check passes.
- **Progress you can read**: see reception speed, elapsed time and estimated time remaining (ETA). Large file sizes automatically use MB.
- **Save, share and forward**: save files, copy messages, or relay to another device while preserving the content kind. System sharing depends on device support.
- **Invite with a scan**: tap “Invite” on the home page; the other person scans the URL code to open the same site.
- **Phone and desktop support**: open in a browser or install to your home screen or desktop. Android also has a release-signed APK.
- **English and Chinese**: layouts adapt to phone and desktop screens, and your language choice is remembered.

A recent capacity improvement adds **100 content bytes per default frame, about 4.45%**, at the same QR size and error-correction strength. This increases capacity; actual speed still depends on the devices and environment.

## Start in three steps

1. **Open the app on both devices.** Use “Invite” to help the other person find it.
2. **Choose a file or enter text on the sender** and keep the QR code on screen.
3. **Open Receive and start its camera**, point it at the code, then save the file or copy the message after verification.

Raise the sender’s brightness, keep the whole QR code in view, and hold both devices steady.

## Install and use offline

- **iPhone / iPad**: open in Safari → Share → Add to Home Screen.
- **Android**: install the [latest APK](https://github.com/TatsuhiroC/optical-transfer-pwa/releases/latest), or install the PWA from your browser menu.
- **Desktop**: use the web app directly, or install the PWA in a supported browser.

The first web visit and URL invitations need a network connection. Once its assets are cached, the web app can transfer offline; the APK includes the required assets.

## FAQ

**How large can a file be?** Up to **64 MiB with default settings**. Photos and small files are a better fit; larger files take longer.

**Why is it slow?** Speed depends on code clarity, the camera and lighting. Start with defaults, raise screen brightness, and hold steady. ETA is an estimate and adjusts as reception changes.

**Are files uploaded?** No files are uploaded to a server. The optical channel carries plaintext; the integrity check detects transfer errors and does not encrypt files.

[Development & deployment](docs/development.md) · [Protocol & settings](docs/protocol.md) · [Release notes](https://github.com/TatsuhiroC/optical-transfer-pwa/releases)

## Credits

Based on [BashAlarmist’s decimen-optical-transfer](https://github.com/bashalarmistalt/decimen-optical-transfer), extended by [TatsuhiroC](https://github.com/TatsuhiroC) into a PWA and Android app with both sending and receiving.

[MIT](LICENSE) · Copyright © 2026 BashAlarmist · Extensions by TatsuhiroC
