#!/usr/bin/env node
// Prepare the freshly generated Capacitor Android project for CI:
//
//  1. install a *stable* release keystore (from GitHub Secrets) so consecutive APKs
//     can be installed over each other. Without this, `assembleDebug` mints a brand
//     new debug key on every runner, and Android refuses the upgrade with
//     "App not installed" / signature mismatch.
//  2. stamp versionCode / versionName so each release is actually newer than the last.
//  3. add the CAMERA permission the receive role needs (the Capacitor template has
//     none, and without it the WebView denies getUserMedia).
//
// The changes are appended to the generated android/app/build.gradle and patched into
// AndroidManifest.xml, both of which are gitignored and recreated by
// `npx cap add android` on every run — nothing here is meant to be committed.
//
// Usage: node scripts/prepare-android.mjs [androidDir=android]
// Env:   ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD
//        GITHUB_REF_TYPE, GITHUB_REF_NAME, GITHUB_RUN_NUMBER, GITHUB_SHA (set by Actions)

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MARKER = '// --- injected by scripts/prepare-android.mjs ---';
const GRADLE = 'app/build.gradle';
const MANIFEST = 'app/src/main/AndroidManifest.xml';
const KEYSTORE = 'app/ci-release.keystore';
const PROPS = 'keystore.properties';

const androidDir = process.argv[2] ?? 'android';
const gradlePath = join(androidDir, GRADLE);

function fail(message) {
	console.error(`[android] ${message}`);
	process.exit(1);
}
function annotate(level, message) {
	console.log(`::${level}::${message}`);
}

if (!existsSync(gradlePath)) {
	fail(`${gradlePath} not found — run \`npx cap add android\` first`);
}

const keystoreB64 = (process.env.ANDROID_KEYSTORE_BASE64 ?? '').trim();
const storePassword = process.env.ANDROID_KEYSTORE_PASSWORD ?? '';
const keyAlias = process.env.ANDROID_KEY_ALIAS ?? '';
const keyPassword = process.env.ANDROID_KEY_PASSWORD ?? '';
const signingReady = Boolean(keystoreB64 && storePassword && keyAlias && keyPassword);

// ---------------------------------------------------------------- version stamping
function parseVersion(raw) {
  const clean = (raw ?? '').trim().replace(/^v/i, '');
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(clean) ? clean : null;
}
const refType = process.env.GITHUB_REF_TYPE ?? '';
const refName = (process.env.GITHUB_REF_NAME ?? '').trim();
const run = process.env.GITHUB_RUN_NUMBER ?? '';
const sha = (process.env.GITHUB_SHA ?? '').slice(0, 7);
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
if (refType === 'tag' && !parseVersion(refName)) fail('Tag must be a semantic version');
if (refType === 'tag' && !signingReady) fail('Tagged releases require all four signing secrets');
if ([keystoreB64, storePassword, keyAlias, keyPassword].some(Boolean) && !signingReady) fail('Incomplete signing secrets');

// One numbering scheme for both main and tags, with a migration offset above
// previous semver-derived codes. Reruns keep the same code; new runs increase it.
let versionCode;
const explicitCode = process.env.ANDROID_VERSION_CODE;
if (explicitCode !== undefined) {
  if (!/^[1-9]\d*$/.test(explicitCode)) fail('Invalid ANDROID_VERSION_CODE');
  versionCode = Number(explicitCode);
} else if (run) {
  if (!/^[1-9]\d*$/.test(run)) fail('Invalid GITHUB_RUN_NUMBER');
  versionCode = 100000000 + Number(run);
}
if (versionCode !== undefined && (!Number.isSafeInteger(versionCode) || versionCode > 2100000000)) {
  fail('versionCode exceeds the Android limit');
}
const baseVersion = parseVersion(pkg.version);
if (!baseVersion) fail('Invalid package version');
const versionName = refType === 'tag' ? parseVersion(refName) :
  `${baseVersion}-dev.${run || 'local'}${/^[0-9a-f]{7}$/.test(sha) ? `+${sha}` : ''}`;

// ---------------------------------------------------------------- injected gradle
const lines = [
	'',
	MARKER,
	'def ciKeystorePropsFile = rootProject.file(\'keystore.properties\')',
	'def ciKeystoreProps = new Properties()',
	'if (ciKeystorePropsFile.exists()) {',
	'    ciKeystorePropsFile.withInputStream { ciKeystoreProps.load(it) }',
	'}',
	'',
	'android {',
];

lines.push('    defaultConfig {');
if (versionCode !== undefined) lines.push(`        versionCode ${versionCode}`);
lines.push(`        versionName "${versionName}"`, '    }');
if (signingReady) {
	lines.push(
		'    signingConfigs {',
		'        release {',
		`            storeFile rootProject.file('${KEYSTORE}')`,
		"            storePassword ciKeystoreProps['storePassword']",
		"            keyAlias ciKeystoreProps['keyAlias']",
		"            keyPassword ciKeystoreProps['keyPassword']",
		'        }',
		'    }',
		'    buildTypes {',
		'        release {',
		'            signingConfig signingConfigs.release',
		'        }',
		'    }'
	);
}
lines.push('}', MARKER, '');

const gradle = readFileSync(gradlePath, 'utf8');
const from = gradle.indexOf(MARKER);
let cleanGradle = gradle;
if (from !== -1) {
  const to = gradle.indexOf(MARKER, from + MARKER.length);
  if (to === -1) fail('Incomplete previously injected Gradle block');
  cleanGradle = gradle.slice(0, from) + gradle.slice(to + MARKER.length);
}
writeFileSync(gradlePath, cleanGradle.replace(/\s*$/, '\n') + lines.join('\n'));

// ---------------------------------------------------------------- camera permission
// Capacitor's WebChromeClient only grants the WebView's getUserMedia request when the
// app itself holds android.permission.CAMERA, and the template manifest does not ask
// for it. The send role works without a camera, so the feature stays optional.
const manifestPath = join(androidDir, MANIFEST);
if (!existsSync(manifestPath)) {
	fail(`${manifestPath} not found — run \`npx cap add android\` first`);
}
let manifest = readFileSync(manifestPath, 'utf8');
if (!manifest.includes('android.permission.CAMERA')) {
	const declarations = [
		"    <!-- receive role: the WebView needs getUserMedia to film the sender's codes -->",
		'    <uses-permission android:name="android.permission.CAMERA" />',
		'    <!-- optional: a device without a camera can still send -->',
		'    <uses-feature android:name="android.hardware.camera" android:required="false" />',
	].join('\n');
	manifest = manifest.replace(/<manifest[\s\S]*?>/, match => `${match}\n${declarations}`);
	writeFileSync(manifestPath, manifest);
	console.log('[android] declared CAMERA permission in AndroidManifest.xml');
}

// ---------------------------------------------------------------- keystore + props
let mode = 'debug';

if (signingReady) {
	const keystore = Buffer.from(keystoreB64, 'base64');
	if (keystore.length < 100) fail('ANDROID_KEYSTORE_BASE64 does not decode to a keystore file');
	mkdirSync(join(androidDir, 'app'), { recursive: true });
	writeFileSync(join(androidDir, KEYSTORE), keystore, { mode: 0o600 });

	// java.util.Properties syntax: backslashes, separators and #/! must be escaped,
	// and so must leading/trailing spaces (which would otherwise be trimmed away).
	const escape = value =>
		String(value)
			.replace(/\\/g, '\\\\')
			.replace(/\r?\n/g, '\\n')
			.replace(/\t/g, '\\t')
			.replace(/([=:#!])/g, '\\$1')
			.replace(/^ /, '\\ ')
			.replace(/ $/, '\\ ');
	writeFileSync(
		join(androidDir, PROPS),
		[
			`storeFile=${KEYSTORE}`,
			`storePassword=${escape(storePassword)}`,
			`keyAlias=${escape(keyAlias)}`,
			`keyPassword=${escape(keyPassword)}`,
			'',
		].join('\n'),
		{ mode: 0o600 }
	);
	mode = 'release';
	console.log(`[android] release signing configured (alias "${keyAlias}", keystore ${keystore.length} bytes)`);
} else {
	annotate(
		'warning',
		'No release keystore secrets found — falling back to a debug APK. Each run generates a NEW debug key, so users must uninstall before installing the next build. Set ANDROID_KEYSTORE_BASE64 / ANDROID_KEYSTORE_PASSWORD / ANDROID_KEY_ALIAS / ANDROID_KEY_PASSWORD (see README) to fix this.'
	);
}

if (versionCode !== undefined) {
	console.log(`[android] versionName=${versionName} versionCode=${versionCode}`);
} else {
	console.log(`[android] local build: versionName=${versionName}; template versionCode retained (set ANDROID_VERSION_CODE to override)`);
}

const apkPath = `${androidDir}/app/build/outputs/apk/${mode}/app-${mode}.apk`;
console.log(`[android] build target: assemble${mode === 'release' ? 'Release' : 'Debug'} -> ${apkPath}`);

if (process.env.GITHUB_OUTPUT) {
	appendFileSync(
		process.env.GITHUB_OUTPUT,
		`mode=${mode}\napk_path=${apkPath}\nversion_name=${versionName ?? ''}\n`
	);
}
if (process.env.GITHUB_STEP_SUMMARY) {
	appendFileSync(
		process.env.GITHUB_STEP_SUMMARY,
		[
			'### Android build',
			'',
			`- signing: **${mode === 'release' ? 'release keystore' : 'debug (unstable signature!)'}**`,
			versionCode !== undefined ? `- versionName: \`${versionName}\`, versionCode: \`${versionCode}\`` : '',
			`- apk: \`${apkPath}\``,
			'',
		]
			.filter(Boolean)
			.join('\n')
	);
}
