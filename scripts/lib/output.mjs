// The only place the sync touches the repo. It runs after everything has been fetched,
// normalized and validated, so a failure earlier leaves every file exactly as it was.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readdir, rename, rm, writeFile, open, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { MEDIA_FILE } from './media.mjs';
import { SyncError } from './http.mjs';

export const sha256 = (s) => createHash('sha256').update(s).digest('hex');

export function readJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}

/** Write each file only if its content hash changed (temp file + rename, so readers never see half a file). */
export async function commitOutputs({ root, files, stagingDir, mediaDir, keepMedia }) {
  const changed = [], unchanged = [];
  await mkdir(mediaDir, { recursive: true });

  // 1. New images first, so no JSON ever points at a missing file.
  const staged = existsSync(stagingDir) ? await readdir(stagingDir) : [];
  for (const f of staged) {
    if (existsSync(join(mediaDir, f))) continue;
    await rename(join(stagingDir, f), join(mediaDir, f));
  }

  // 2. Data files.
  for (const { rel, content } of files) {
    const path = join(root, rel);
    const before = existsSync(path) ? sha256(readFileSync(path)) : null;
    if (before === sha256(content)) { unchanged.push(rel); continue; }
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.tmp-${process.pid}`;
    await writeFile(tmp, content);
    await rename(tmp, path);
    changed.push(rel);
  }

  // 3. Images no longer referenced (only files this script created).
  const removed = [];
  for (const f of await readdir(mediaDir)) {
    if (MEDIA_FILE.test(f) && !keepMedia.has(f)) { await rm(join(mediaDir, f)); removed.push(f); }
  }
  return { changed, unchanged, addedMedia: staged.filter((f) => keepMedia.has(f)), removedMedia: removed };
}

/** One sync at a time. A lock older than 15 minutes is treated as stale (crashed run). */
export async function acquireLock(root) {
  const path = join(root, '.sync.lock');
  try {
    const s = await stat(path);
    if (Date.now() - s.mtimeMs > 15 * 60_000) await rm(path, { force: true });
  } catch { /* no lock */ }
  let handle;
  try {
    handle = await open(path, 'wx');
  } catch {
    throw new SyncError(`Another sync is running (${path} exists). Wait for it, or delete the file if no sync is running.`);
  }
  await handle.writeFile(`${process.pid}\n`);
  await handle.close();
  return () => rm(path, { force: true });
}
