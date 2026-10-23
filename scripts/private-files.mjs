import { writeFileSync, renameSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, basename, join } from 'node:path';

/** A new 600 inode avoids inheriting old permissions or following target symlinks. */
export function writePrivateFile(path, data) {
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, data, { flag: 'wx', mode: 0o600 });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}
