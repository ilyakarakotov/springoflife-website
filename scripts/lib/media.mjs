// Copies event/group images into the repo under content-hashed names. Never hotlinks:
// PCO's signup logo redirects to a signed URL that expires within about a day.
// A small manifest (source identity -> file) avoids re-downloading unchanged images every run.
//
// One bad image never blocks the sync: if a download fails, the previous file for that event or
// group is kept (or the card shows no image) and the problem is reported as a warning.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SyncError } from './http.mjs';

const EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };
const MAX_BYTES = 8 * 1024 * 1024;
export const MEDIA_FILE = /^(signup|group)-[\w-]+-[0-9a-f]{12}\.(jpg|png|webp|gif|avif)$/;

/** Signed PCO image URLs differ on every request only in expiry/signature; the rest identifies the image. */
export function identityOf(url) {
  const u = new URL(url);
  for (const p of ['expires_at', 'signature', 'X-Amz-Date', 'X-Amz-Signature', 'X-Amz-Expires', 'X-Amz-Credential', 'X-Amz-SignedHeaders']) u.searchParams.delete(p);
  return u.toString();
}

const isPcoLogo = (url) => /^https:\/\/registrations\.planningcenteronline\.com\/signups\/\d+\/logo/.test(url);

/** Download one image into stagingDir. Returns the file name. Throws SyncError on any problem. */
async function download({ http, key, url, mediaDir, stagingDir, manifest, log }) {
  let target = url;
  // The stable PCO /logo URL 302s to the signed image. Ask for the redirect only (no body) to learn
  // which image it currently is, so an unchanged image costs one tiny request.
  if (isPcoLogo(url)) {
    const r = await http.request(url, { redirect: 'manual' });
    const loc = r.headers.get('location');
    await r.body?.cancel().catch(() => {});
    if (r.status >= 300 && r.status < 400 && loc) target = new URL(loc, url).toString();
    else if (!r.ok) throw new SyncError(`HTTP ${r.status}`);
  }

  const id = identityOf(target);
  const known = manifest[id];
  if (known && MEDIA_FILE.test(known) && known.startsWith(`${key}-`) && existsSync(join(mediaDir, known))) {
    return { id, file: known, reused: true };
  }

  const res = await http.request(target);
  if (!res.ok) { await res.body?.cancel().catch(() => {}); throw new SyncError(`HTTP ${res.status}`); }
  const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const ext = EXT[type];
  if (!ext) { await res.body?.cancel().catch(() => {}); throw new SyncError(`unexpected content-type "${type}"`); }
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length > MAX_BYTES) throw new SyncError(`size ${buf.length} bytes is out of range`);
  const file = `${key}-${createHash('sha256').update(buf).digest('hex').slice(0, 12)}.${ext}`;
  if (!existsSync(join(mediaDir, file))) await writeFile(join(stagingDir, file), buf);
  log(`  image ${key}: ${file} (${Math.round(buf.length / 1024)} KB)`);
  return { id, file, reused: false };
}

/**
 * @param items  [{ key: "signup-3894463", url }]
 * @returns {Promise<{ files: Map<string, string>, manifest: Record<string, string>, stats: Record<string, number>, warnings: string[] }>}
 */
export async function syncMedia({ http, items, mediaDir, stagingDir, manifest, log = () => {} }) {
  const files = new Map();
  const nextManifest = {};
  const stats = { referenced: 0, downloaded: 0, reused: 0, failed: 0 };
  const warnings = [];

  for (const { key, url } of items) {
    if (!url) continue;
    stats.referenced++;
    try {
      const { id, file, reused } = await download({ http, key, url, mediaDir, stagingDir, manifest, log });
      nextManifest[id] = file;
      files.set(key, file);
      stats[reused ? 'reused' : 'downloaded']++;
    } catch (err) {
      stats.failed++;
      // Keep the image this event/group had before, if it's still on disk.
      const previous = Object.entries(manifest).find(([, f]) => MEDIA_FILE.test(f) && f.startsWith(`${key}-`) && existsSync(join(mediaDir, f)));
      if (previous) { nextManifest[previous[0]] = previous[1]; files.set(key, previous[1]); }
      warnings.push(`image ${key}: ${err.message}${previous ? ' (kept the previous image)' : ' (shown without an image)'}`);
    }
  }
  return { files, manifest: nextManifest, stats, warnings };
}

export const sortKeys = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
