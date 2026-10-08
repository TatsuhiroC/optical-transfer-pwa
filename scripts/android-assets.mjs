// Android-only branding using the maintained top-level sharp dependency.
// Avoid pulling in the legacy assets tool's old CLI, tar and native image libs.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const androidDir = process.argv[2] ?? 'android';
const res = join(androidDir, 'app/src/main/res');
const densities = { ldpi: 0.75, mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
async function image(source, directory, name, width, height, background = '#121009') {
  const folder = join(res, directory);
  await mkdir(folder, { recursive: true });
  await sharp(join('resources', source)).resize(width, height, { fit: 'contain', background })
    .png().toFile(join(folder, name));
}
for (const [density, scale] of Object.entries(densities)) {
  const dir = `mipmap-${density}`;
  await image('icon-only.png', dir, 'ic_launcher.png', 48 * scale, 48 * scale, '#ffb257');
  await image('icon-only.png', dir, 'ic_launcher_round.png', 48 * scale, 48 * scale, '#ffb257');
  await image('icon-foreground.png', dir, 'ic_launcher_foreground.png', 108 * scale, 108 * scale, { r: 0, g: 0, b: 0, alpha: 0 });
  await image('icon-background.png', dir, 'ic_launcher_background.png', 108 * scale, 108 * scale, '#ffb257');
  for (const [orientation, w, h] of [['land', 480, 320], ['port', 320, 480]]) {
    await image('splash.png', `drawable-${orientation}-${density}`, 'splash.png', w * scale, h * scale);
    await image('splash-dark.png', `drawable-${orientation}-night-${density}`, 'splash.png', w * scale, h * scale);
  }
}
await image('splash.png', 'drawable', 'splash.png', 320, 480);
await image('splash-dark.png', 'drawable-night', 'splash.png', 320, 480);
const adaptive = join(res, 'mipmap-anydpi-v26');
await mkdir(adaptive, { recursive: true });
const xml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@mipmap/ic_launcher_background" />
  <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`;
for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) await writeFile(join(adaptive, name), xml);
console.log('[android] icons and splash generated');
