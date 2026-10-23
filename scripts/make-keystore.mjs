// Key material stays local; GitHub configuration is an explicit separate command.
import {
  mkdirSync, mkdtempSync, lstatSync, readFileSync, writeFileSync,
  chmodSync, linkSync, unlinkSync, rmSync,
} from 'node:fs';
import { randomBytes, X509Certificate } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

process.umask(0o077);
class SetupError extends Error {}
const secretNames = [
  'ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PASSWORD',
  'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD', 'ANDROID_CERT_SHA256',
];
function fail(message) { throw new SetupError(message); }
function absent(path) {
  try { lstatSync(path); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  fail('Refusing to overwrite existing signing material.');
}
function privateEntry(path, directory = false) {
  const info = lstatSync(path);
  if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile()))
    fail('Signing paths must be regular files in a private directory.');
  if ((info.mode & 0o077) || (process.getuid && info.uid !== process.getuid()))
    fail('Use an owned private directory (700) and private configuration file (600).');
}
function run(command, args, options = {}) {
  const child = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (child.error || child.status !== 0)
    fail(`${command} failed; check its installation and configuration. Tool output was withheld to protect secrets.`);
  return child.stdout;
}
function configureGithub(file, repo) {
  privateEntry(dirname(file), true);
  privateEntry(file);
  const config = JSON.parse(readFileSync(file, 'utf8'));
  for (const name of secretNames)
    if (typeof config[name] !== 'string' || !config[name]) fail('The signing configuration is incomplete.');
  if (!/^[a-f\d]{2}(?::[a-f\d]{2}){31}$/i.test(config.ANDROID_CERT_SHA256))
    fail('Invalid certificate fingerprint.');
  // Secrets travel on stdin, never in command arguments or logs.
  for (const name of secretNames)
    run('gh', ['secret', 'set', name, '--repo', repo], { input: config[name] });
  console.log(`Signing secrets configured for ${repo}.`);
}
function generate(path) {
  const configPath = `${path}.secrets.json`;
  absent(path);
  absent(configPath);
  const folder = dirname(path);
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  privateEntry(folder, true);
  const alias = process.env.KEY_ALIAS || 'optical-transfer-pwa';
  const days = process.env.VALIDITY_DAYS || '10000';
  if (!/^[1-9]\d*$/.test(days)) fail('VALIDITY_DAYS must be a positive integer.');
  const password = process.env.ANDROID_KEYSTORE_PASSWORD || randomBytes(32).toString('base64url');
  if (password.length < 6) fail('The keystore password must have at least six characters.');
  const env = { ...process.env, OPTICAL_KEYTOOL_PASSWORD: password };
  const stage = mkdtempSync(join(folder, '.keygen-'));
  try {
    const temporaryKey = join(stage, 'release.keystore');
    run('keytool', [
      '-genkeypair', '-keystore', temporaryKey, '-alias', alias,
      '-keyalg', 'RSA', '-keysize', '4096', '-validity', days,
      '-storepass:env', 'OPTICAL_KEYTOOL_PASSWORD',
      '-keypass:env', 'OPTICAL_KEYTOOL_PASSWORD',
      '-dname', 'CN=optical-transfer-pwa, OU=personal, O=optical-transfer-pwa, C=CN',
    ], { env });
    chmodSync(temporaryKey, 0o600);
    const publicInfo = run('keytool', [
      '-list', '-rfc', '-keystore', temporaryKey, '-alias', alias,
      '-storepass:env', 'OPTICAL_KEYTOOL_PASSWORD',
    ], { env });
    const pem = publicInfo.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/)?.[0];
    if (!pem) fail('Could not read the public signing certificate.');
    const fingerprint = new X509Certificate(pem).fingerprint256;
    const config = {
      ANDROID_KEYSTORE_BASE64: readFileSync(temporaryKey).toString('base64'),
      ANDROID_KEYSTORE_PASSWORD: password,
      ANDROID_KEY_ALIAS: alias,
      ANDROID_KEY_PASSWORD: password,
      ANDROID_CERT_SHA256: fingerprint,
    };
    const temporaryConfig = join(stage, 'secrets.json');
    writeFileSync(temporaryConfig, JSON.stringify(config, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    // Exclusive links cannot replace files created after the initial checks.
    linkSync(temporaryKey, path);
    try { linkSync(temporaryConfig, configPath); }
    catch (error) { unlinkSync(path); throw error; }
    console.log(`Keystore: ${path}\nPrivate configuration: ${configPath}\nCertificate SHA-256: ${fingerprint}`);
    console.log('Back up both private files. Existing releases must keep their original signing key.');
    console.log('GitHub configuration is a separate command; see docs/development.md.');
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}
try {
  const args = process.argv.slice(2);
  if (args[0] === '--configure-github') {
    if (!args[1] || (args.length !== 2 && !(args.length === 4 && args[2] === '--repo')))
      fail('Usage: --configure-github private.secrets.json [--repo owner/repo]');
    const repo = args[3] || 'TatsuhiroC/optical-transfer-pwa';
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) fail('Invalid GitHub repository name.');
    configureGithub(resolve(args[1]), repo);
  } else {
    if (args.length > 1 || args[0]?.startsWith('-')) fail('Usage: [path/to/private/release.keystore]');
    generate(resolve(args[0] || join(homedir(), '.optical-transfer-pwa', 'release.keystore')));
  }
} catch (error) {
  console.error(error instanceof SetupError ? error.message : 'Signing setup failed; tool output was withheld to protect secrets.');
  process.exitCode = 1;
}
