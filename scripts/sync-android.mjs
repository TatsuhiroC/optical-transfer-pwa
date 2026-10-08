import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function run(script, ...args) {
  const result = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const cap = 'node_modules/@capacitor/cli/bin/capacitor';
if (!existsSync('android/app/src/main/AndroidManifest.xml')) run(cap, 'add', 'android');
run('scripts/prepare-android.mjs');
run('scripts/android-assets.mjs');
run(cap, 'sync', 'android');
