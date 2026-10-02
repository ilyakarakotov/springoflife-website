#!/usr/bin/env node
// Deterministic Planning Center -> website sync. No AI anywhere in this path.
//
//   SYNC_ADAPTER=pco           production: official API + Personal Access Token (PCO_APP_ID / PCO_SECRET)
//   SYNC_ADAPTER=churchcenter  prototype only: undocumented Church Center web API, no token needed
//
// Writes (only when content changed):
//   src/data/events.json, src/data/groups.json, src/data/media-manifest.json,
//   src/assets/sync/*  (content-hashed images; the build makes responsive AVIF/WebP from them),
//   public/events.ics, out/weekly-digest.md
//
// Events and Life Groups are separate feeds. If one fails (no Groups permission, an outage, bad
// data, a suspicious empty list), that feed keeps its last good data and the other one is still
// published; the run then exits 1 with "SYNC PARTIAL" so someone is alerted. A broken image keeps
// the previous image. If everything fails, nothing is written.
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse as parseYaml } from 'yaml';
import * as pco from './adapters/pco.mjs';
import * as churchcenter from './adapters/churchcenter.mjs';
import { createHttp, SyncError } from './lib/http.mjs';
import { normalizeEvents, normalizeGroups, validateEvents, validateGroups } from './lib/normalize.mjs';
import { syncMedia, sortKeys } from './lib/media.mjs';
import { buildIcs } from './lib/ics.mjs';
import { buildDigest } from './lib/digest.mjs';
import { acquireLock, commitOutputs, readJson } from './lib/output.mjs';
import { isLive } from '../src/lib/events.mjs';

export const ADAPTERS = { pco, churchcenter };

/** Raised when at least one feed or image failed but the rest was published. */
export class PartialSyncError extends SyncError {}

export function readConfig(env) {
  const config = {
    adapter: (env.SYNC_ADAPTER || 'pco').trim().toLowerCase(),
    appId: env.PCO_APP_ID?.trim(),
    secret: env.PCO_SECRET?.trim(),
    categoryId: String(env.PCO_WEBSITE_CATEGORY_ID || '111199').trim(), // "Website Category " (renaming it keeps the ID)
    groupTypeId: String(env.PCO_LIFE_GROUP_TYPE_ID || '222818').trim(), // "English Life Groups"
    pcoApi: (env.PCO_API_BASE || 'https://api.planningcenteronline.com').replace(/\/$/, ''),
    churchCenterUrl: (env.CHURCH_CENTER_URL || 'https://springoflifechurch.churchcenter.com').replace(/\/$/, ''),
    churchCenterApi: (env.CHURCH_CENTER_API || 'https://api.churchcenter.com').replace(/\/$/, ''),
    siteUrl: (env.SITE_URL || 'https://springoflifechurch.com').replace(/\/$/, ''),
    allowEmpty: env.SYNC_ALLOW_EMPTY === '1' || env.SYNC_ALLOW_EMPTY === 'true',
    now: env.SYNC_NOW ? new Date(env.SYNC_NOW) : new Date(),
  };
  if (!/^\d+$/.test(config.categoryId)) throw new SyncError(`PCO_WEBSITE_CATEGORY_ID must be a numeric ID, got "${config.categoryId}"`);
  if (!/^\d+$/.test(config.groupTypeId)) throw new SyncError(`PCO_LIFE_GROUP_TYPE_ID must be a numeric ID, got "${config.groupTypeId}"`);
  if (Number.isNaN(config.now.getTime())) throw new SyncError(`SYNC_NOW is not a valid date: "${env.SYNC_NOW}"`);
  // The Church Center adapter uses an undocumented API; production must not switch to it silently.
  if (config.adapter === 'churchcenter' && env.GITHUB_ACTIONS === 'true' && env.ALLOW_PROTOTYPE_ADAPTER !== '1') {
    throw new SyncError('SYNC_ADAPTER=churchcenter is a local prototype and is refused in GitHub Actions. Use "pco", or set the repository variable ALLOW_PROTOTYPE_ADAPTER=1 to run the prototype on purpose.');
  }
  return config;
}

/**
 * Refuse to replace a healthy feed with an empty one: an API hiccup or a lost permission looks
 * like "0 results". Compares what the API returned with the previous items that are still live,
 * so events that simply ended over the weekend never trip it.
 */
function guardEmpty(kind, apiCount, prevLiveCount, allowEmpty) {
  if (apiCount === 0 && prevLiveCount >= 3 && !allowEmpty) {
    throw new SyncError(`Planning Center returned 0 ${kind}, but the site still lists ${prevLiveCount} current ${kind}. `
      + `Refusing to publish an empty list. If this is real, run the sync once with "allow empty" checked (SYNC_ALLOW_EMPTY=1).`);
  }
}

function readYamlIfExists(path) {
  if (!existsSync(path)) return null;
  try { return parseYaml(readFileSync(path, 'utf8')); } catch (err) { throw new SyncError(`${path} is not valid YAML: ${err.message}`); }
}

const errorMessage = (err) => (err instanceof SyncError ? err.message : `${err?.name ?? 'Error'}: ${err?.message ?? err}`);

export async function runSync({ root = process.cwd(), env = process.env, fetchImpl = globalThis.fetch, sleep, log = console.log } = {}) {
  const config = readConfig(env);
  const adapter = ADAPTERS[config.adapter];
  if (!adapter) throw new SyncError(`Unknown SYNC_ADAPTER "${config.adapter}". Use "pco" (production) or "churchcenter" (prototype only).`);

  const paths = {
    events: 'src/data/events.json',
    groups: 'src/data/groups.json',
    manifest: 'src/data/media-manifest.json',
    ics: 'public/events.ics',
    digest: 'out/weekly-digest.md',
    mediaDir: join(root, 'src/assets/sync'),
  };
  const site = parseYaml(readFileSync(join(root, 'src/content/site.yaml'), 'utf8'));
  // Groups whose photo staff replaced or hid (src/content/group-overrides.yaml): their PCO header
  // image is not downloaded at all, so it never reaches the repo or the built site.
  const overriddenImages = new Set((readYamlIfExists(join(root, 'src/content/group-overrides.yaml'))?.groups ?? [])
    .filter((o) => o?.image).map((o) => String(o.id)));

  const release = await acquireLock(root);
  let stagingDir;
  try {
    stagingDir = await mkdtemp(join(root, '.sync-staging-'));
    log(`Sync started (${adapter.label})`);
    if (adapter.name === 'churchcenter') log('  NOTE: prototype adapter. Switch to SYNC_ADAPTER=pco with a Personal Access Token for production.');
    const http = createHttp({ fetchImpl, sleep, log });
    const failures = [];

    // 1. Fetch both feeds independently. Nothing is written yet.
    const ctx = { http, config, log };
    const [rawEvents, rawGroups] = await Promise.allSettled([adapter.fetchEvents(ctx), adapter.fetchGroups(ctx)]);
    const apiRequests = http.count;

    const prevEvents = readJson(join(root, paths.events), []);
    const prevGroups = readJson(join(root, paths.groups), []);

    // 2. Normalize, validate and guard each feed on its own. A failure keeps that feed's last good data.
    let events = null, groups = null;
    try {
      if (rawEvents.status === 'rejected') throw rawEvents.reason;
      const tagged = rawEvents.value.filter((e) => e.category_ids?.map(String).includes(config.categoryId));
      guardEmpty('events', tagged.length, prevEvents.filter((e) => isLive(e, config.now)).length, config.allowEmpty);
      events = normalizeEvents(rawEvents.value, { categoryId: config.categoryId, now: config.now, source: adapter.name });
      validateEvents(events);
    } catch (err) {
      events = null;
      failures.push(`events: ${errorMessage(err)}`);
    }
    try {
      if (rawGroups.status === 'rejected') throw rawGroups.reason;
      groups = normalizeGroups(rawGroups.value, { groupTypeId: config.groupTypeId, source: adapter.name });
      guardEmpty('groups', groups.length, prevGroups.length, config.allowEmpty);
      validateGroups(groups);
    } catch (err) {
      groups = null;
      failures.push(`groups: ${errorMessage(err)}`);
    }
    if (!events && !groups) throw new SyncError(`Nothing was updated.\n  - ${failures.join('\n  - ')}`);

    // 3. Images -> staging dir (moved into place by commitOutputs). Feeds that failed keep the
    //    images they already reference.
    const prevManifest = readJson(join(root, paths.manifest), {});
    const media = await syncMedia({
      http,
      items: [
        ...(events ?? []).map((e) => ({ key: `signup-${e.id}`, url: e._image_url })),
        ...(groups ?? []).map((g) => ({ key: `group-${g.id}`, url: overriddenImages.has(g.id) ? null : g._image_url })),
      ],
      mediaDir: paths.mediaDir,
      stagingDir,
      manifest: prevManifest,
      log,
    });
    failures.push(...media.warnings);
    // The JSON stores the file name in src/assets/sync/; pages resolve it through Astro's image pipeline.
    for (const e of events ?? []) { e.image = media.files.get(`signup-${e.id}`) ?? null; delete e._image_url; }
    for (const g of groups ?? []) { g.image = media.files.get(`group-${g.id}`) ?? null; delete g._image_url; }

    const outEvents = events ?? prevEvents;
    // Images still referenced by a feed that kept its old data stay on disk and in the manifest.
    const fileOf = (p) => (typeof p === 'string' ? p.replace(/^.*\//, '') : null); // older data had "/media/<file>"
    const keptFiles = new Set([...(events ? [] : prevEvents), ...(groups ? [] : prevGroups)].map((x) => fileOf(x.image)).filter(Boolean));
    const manifest = { ...media.manifest };
    for (const [id, file] of Object.entries(prevManifest)) if (keptFiles.has(file)) manifest[id] = file;
    const keepMedia = new Set([...media.files.values(), ...keptFiles]);

    // 4. Write only what changed.
    const json = (v) => JSON.stringify(v, null, 2) + '\n';
    const liveEvents = outEvents.filter((e) => isLive(e, config.now));
    const result = await commitOutputs({
      root,
      stagingDir,
      mediaDir: paths.mediaDir,
      keepMedia,
      files: [
        ...(events ? [{ rel: paths.events, content: json(events) }] : []),
        ...(groups ? [{ rel: paths.groups, content: json(groups) }] : []),
        { rel: paths.manifest, content: json(sortKeys(manifest)) },
        { rel: paths.ics, content: buildIcs(liveEvents, { siteUrl: config.siteUrl, calName: site.name }) },
        { rel: paths.digest, content: buildDigest(liveEvents, { now: config.now, site, siteUrl: config.siteUrl }) },
      ],
    });

    const summary = {
      adapter: adapter.name,
      events: events ? events.length : null,
      groups: groups ? groups.length : null,
      eventTitles: (events ?? []).map((e) => e.title),
      groupTitles: (groups ?? []).map((g) => g.title),
      requests: { api: apiRequests, images: http.count - apiRequests },
      media: { ...media.stats, added: result.addedMedia.length, removed: result.removedMedia.length },
      changed: result.changed,
      unchanged: result.unchanged,
      failures,
    };
    log([
      `Sync ${failures.length ? 'PARTIAL' : 'OK'} via ${adapter.name}`,
      events ? `  events: ${events.length} with website category ${config.categoryId}${events.length ? ` (${summary.eventTitles.join('; ')})` : ''}` : '  events: NOT UPDATED (kept the previous data)',
      groups ? `  groups: ${groups.length} in group type ${config.groupTypeId}` : '  groups: NOT UPDATED (kept the previous data)',
      `  requests: ${summary.requests.api} API + ${summary.requests.images} image`,
      `  images: ${media.stats.referenced} referenced, ${media.stats.downloaded} downloaded, ${media.stats.reused} reused, ${media.stats.failed} failed, ${result.removedMedia.length} removed`,
      `  changed: ${result.changed.length ? result.changed.join(', ') : 'nothing (all files identical)'}`,
    ].join('\n'));
    if (failures.length) {
      const err = new PartialSyncError(`Some data was not updated:\n  - ${failures.join('\n  - ')}`);
      err.summary = summary;
      throw err;
    }
    return summary;
  } finally {
    if (stagingDir) await rm(stagingDir, { recursive: true, force: true });
    await release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runSync().then(
    () => process.exit(0),
    (err) => {
      const partial = err instanceof PartialSyncError;
      console.error(`\nSYNC ${partial ? 'PARTIAL' : 'FAILED'}: ${err.message}`);
      if (!(err instanceof SyncError) && err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'));
      console.error(partial
        ? 'Everything else was updated. The parts listed above keep their last good data.'
        : 'No files were changed. The site keeps its last good data.');
      process.exit(1);
    },
  );
}
