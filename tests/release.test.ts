import { expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Exercise the actual CI trust check with public, dummy certificate digests.
const workflow = readFileSync('.github/workflows/build-apk.yml', 'utf8');
const start = workflow.indexOf('          if [ "${{ steps.signing.outputs.mode }}" = "release" ] && [ -z "$ANDROID_CERT_SHA256" ]; then');
const end = workflow.indexOf('          echo "camera permission in APK:', start);
const validation = workflow.slice(start, end).replaceAll('${{ steps.signing.outputs.mode }}', 'release');
const actual = 'ab'.repeat(32);
const other = 'cd'.repeat(32);

it.skipIf(process.platform === 'win32').each([
  { pin: '', accepted: false, report: '' },
  { pin: 'ab', accepted: false, report: '' },
  { pin: 'z'.repeat(64), accepted: false, report: '' },
  { pin: other, accepted: false, report: '' }, // matches a public-key digest, not the certificate
  { pin: actual, accepted: true, report: '' },
  { pin: Array(32).fill('AB').join(':'), accepted: true, report: '' },
  { pin: actual, accepted: true, report: 'V2 Signer: certificate SHA-256 digest: ' + actual + '\n' },
  { pin: actual, accepted: true, report: 'V3 Signer: certificate SHA-256 digest: ' + actual + '\r\n' },
  { pin: actual, accepted: true, report: 'V2 Signer: certificate SHA-256 digest: ' + actual + '\nV3.1 Signer: certificate SHA-256 digest: ' + actual + '\n' },
  { pin: actual, accepted: false, report: 'Signer #1 certificate SHA-256 digest: ' + actual + '\nSigner #2 certificate SHA-256 digest: ' + other + '\n' },
  { pin: actual, accepted: false, report: 'V2 Signer: certificate SHA-256 digest: ' + other + '\n' },
  { pin: actual, accepted: false, report: 'Signer #1 public key SHA-256 digest: ' + actual + '\n' },
])('checks the complete pinned signing certificate ($accepted)', ({ pin, accepted, report }) => {
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const folder = mkdtempSync(join(tmpdir(), 'optical-release-test-'));
  try {
    writeFileSync(join(folder, 'apk-certs.txt'), report || 'Signer #1 certificate SHA-256 digest: ' + actual + '\nSigner #1 public key SHA-256 digest: ' + other + '\n');
    const result = spawnSync('bash', ['-c', 'set -euo pipefail\n' + validation], {
      cwd: folder, encoding: 'utf8', env: { ...process.env, ANDROID_CERT_SHA256: pin },
    });
    expect(result.status === 0).toBe(accepted);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
