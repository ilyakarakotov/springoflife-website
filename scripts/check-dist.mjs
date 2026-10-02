#!/usr/bin/env node
// Smoke test for the built site (dist/). Run after `npm run build`; CI runs it before deploying.
//   node scripts/check-dist.mjs            (base path taken from BASE_PATH / SITE_URL, like the build)
//   DIST_DIR=/tmp/out node scripts/check-dist.mjs   (a build made with --outDir)
//
// Checks
//   - key pages exist and every page has the main navigation
//   - every internal link, image, srcset, stylesheet, script, icon and CSS url() resolves to a file
//   - every #fragment in an internal link exists on the target page
//   - every JSON-LD block is valid JSON and nothing can close its <script> early
//   - PREVIEW builds carry noindex on every page; production builds don't
//   - nothing third-party (iframe, script, stylesheet, image) loads with the page
//   - /feed/events.json matches the events listed on /events/
//   - no [Placeholder] text is visible (unless SHOW_PLACEHOLDERS=true, a draft build)
// Exits 1 with a list of problems.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseDocument, DomUtils } from 'htmlparser2';
import { normalizeBase } from '../src/lib/paths.mjs';

// DIST_DIR checks a build written elsewhere (astro build --outDir ...).
const dist = process.env.DIST_DIR ? `${resolve(process.env.DIST_DIR)}/` : new URL('../dist/', import.meta.url).pathname;
const siteUrl = new URL(process.env.SITE_URL || 'https://springoflifechurch.com');
const base = normalizeBase(process.env.BASE_PATH || siteUrl.pathname);
const preview = process.env.PREVIEW === 'true';
const draft = process.env.SHOW_PLACEHOLDERS === 'true' || process.env.SHOW_PLACEHOLDERS === '1';
const problems = [];
const fail = (where, msg) => problems.push(`${where}: ${msg}`);

if (!existsSync(dist)) { console.error('dist/ not found. Run `npm run build` first.'); process.exit(1); }

const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p); else files.push(p);
  }
})(dist);
const htmlFiles = files.filter((f) => f.endsWith('.html'));

/** URL path (with base) -> file in dist, or null. */
function resolvePath(pathname) {
  if (!pathname.startsWith(base)) return null;
  const rel = decodeURIComponent(pathname.slice(base.length));
  const candidates = rel === '' || rel.endsWith('/') ? [join(dist, rel, 'index.html')] : [join(dist, rel), join(dist, rel, 'index.html'), join(dist, `${rel}.html`)];
  return candidates.find((c) => existsSync(c) && statSync(c).isFile()) ?? null;
}

const docs = new Map();
const docFor = (file) => {
  if (!docs.has(file)) docs.set(file, parseDocument(readFileSync(file, 'utf8')));
  return docs.get(file);
};
const idsIn = (file) => new Set(DomUtils.findAll((n) => Boolean(n.attribs?.id || n.attribs?.name), docFor(file).children).map((n) => n.attribs.id || n.attribs.name));

const origin = siteUrl.origin;
function checkRef(where, raw, pageFile, { fragment = true } = {}) {
  if (!raw || /^(mailto:|tel:|webcal:|data:|javascript:)/i.test(raw)) return;
  let url;
  try { url = new URL(raw, origin + '/' + relative(dist, pageFile).replace(/index\.html$/, '')); } catch { return fail(where, `unparseable URL ${raw}`); }
  if (url.origin !== origin) return; // external
  if (raw.startsWith('#')) {
    if (fragment && raw.length > 1 && !idsIn(pageFile).has(decodeURIComponent(raw.slice(1)))) fail(where, `missing anchor ${raw}`);
    return;
  }
  if (!url.pathname.startsWith(base)) return fail(where, `${raw} is outside the base path ${base}`);
  const target = resolvePath(url.pathname);
  if (!target) return fail(where, `broken link ${raw}`);
  if (fragment && url.hash.length > 1 && target.endsWith('.html')) {
    const doc = docFor(target);
    const isRedirect = DomUtils.findOne((n) => n.name === 'meta' && n.attribs['http-equiv'] === 'refresh', doc.children);
    if (!isRedirect && !idsIn(target).has(decodeURIComponent(url.hash.slice(1)))) fail(where, `missing anchor ${raw}`);
  }
}

for (const file of htmlFiles) {
  const where = relative(dist, file);
  const doc = docFor(file);
  const isRedirect = DomUtils.findOne((n) => n.name === 'meta' && n.attribs['http-equiv'] === 'refresh', doc.children);
  if (isRedirect) {
    const to = /url=(.*)$/i.exec(isRedirect.attribs.content)?.[1];
    if (to) checkRef(`${where} (redirect)`, to, file);
    continue;
  }
  for (const el of DomUtils.findAll(() => true, doc.children)) {
    const a = el.attribs;
    if (a.href && el.name !== 'base') checkRef(`${where} <${el.name} href>`, a.href, file);
    if (a.src) checkRef(`${where} <${el.name} src>`, a.src, file);
    if (a['data-src']) checkRef(`${where} <${el.name} data-src>`, a['data-src'], file);
    for (const set of [a.srcset, a['data-srcset']].filter(Boolean)) {
      for (const part of set.split(',')) checkRef(`${where} srcset`, part.trim().split(/\s+/)[0], file);
    }
    if (el.name === 'meta' && /^(og:image|twitter:image)$/.test(a.property || a.name || '')) checkRef(`${where} ${a.property || a.name}`, a.content, file);
    // Click-to-load: no page may load a third-party frame, script or stylesheet before the visitor asks.
    if (['iframe', 'script', 'link', 'img', 'source', 'video', 'audio'].includes(el.name)) {
      for (const ref of [a.src, el.name === 'link' && /stylesheet|preload|modulepreload/.test(a.rel ?? '') ? a.href : null].filter(Boolean)) {
        if (/^(https?:)?\/\//i.test(ref) && new URL(ref, origin).origin !== origin) fail(where, `<${el.name}> loads ${ref} on page load (use a click-to-load facade)`);
      }
    }
    if (el.name === 'script' && a.type === 'application/ld+json') {
      const text = DomUtils.textContent(el);
      if (/<\/script|<!--/i.test(text)) fail(where, 'JSON-LD contains </script or <!--');
      try { JSON.parse(text); } catch (e) { fail(where, `JSON-LD is not valid JSON: ${e.message}`); }
    }
  }
  const robots = DomUtils.findOne((n) => n.name === 'meta' && n.attribs.name === 'robots', doc.children);
  if (preview && !/noindex/.test(robots?.attribs.content ?? '')) fail(where, 'PREVIEW build without <meta name="robots" content="noindex…">');
  if (!preview && /noindex/.test(robots?.attribs.content ?? '') && where !== '404.html') fail(where, 'production page has noindex');
  if (!DomUtils.findOne((n) => n.attribs?.id === 'site-nav', doc.children)) fail(where, 'missing the main navigation (#site-nav)');
  // Placeholders ([Placeholder: …]) never reach a normal build (src/lib/placeholders.mjs).
  if (!draft) {
    for (const t of DomUtils.filter((n) => n.type === 'text' && !['script', 'style'].includes(n.parent?.name), doc.children)) {
      if (/\[\s*(placeholder|todo|tbd)\b/i.test(t.data)) fail(where, `placeholder text is visible: "${t.data.trim().slice(0, 80)}"`);
    }
    if (DomUtils.findOne((n) => /\bneeds-text\b/.test(n.attribs?.class ?? ''), doc.children)) fail(where, 'a "Needs text" placeholder is visible');
  }
}

// CSS url() references
for (const css of files.filter((f) => f.endsWith('.css'))) {
  for (const m of readFileSync(css, 'utf8').matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
    if (m[1].startsWith('data:') || m[1].startsWith('#')) continue;
    const url = new URL(m[1], origin + base + relative(dist, css));
    if (url.origin === origin && !resolvePath(url.pathname)) fail(relative(dist, css), `broken url(${m[1]})`);
  }
}
// Inline <style> url() references (inlined stylesheets)
for (const file of htmlFiles) {
  for (const m of readFileSync(file, 'utf8').matchAll(/url\(\s*['"]?(\/[^'")]+)['"]?\s*\)/g)) {
    if (!resolvePath(m[1])) fail(relative(dist, file), `broken inline url(${m[1]})`);
  }
}

for (const page of ['index.html', 'visit/index.html', 'about/index.html', 'ministries/index.html', 'life-groups/index.html', 'watch/index.html', 'events/index.html', 'next-steps/index.html', 'give/index.html', '404.html', 'robots.txt', 'events.ics', 'favicon.ico']) {
  if (!existsSync(join(dist, page))) fail(page, 'expected file is missing');
}
const robotsTxt = existsSync(join(dist, 'robots.txt')) ? readFileSync(join(dist, 'robots.txt'), 'utf8') : '';
if (preview && !/Disallow: \/\s*$/m.test(robotsTxt)) fail('robots.txt', 'PREVIEW build must disallow everything');
if (!preview && /Disallow: \/\s*$/m.test(robotsTxt)) fail('robots.txt', 'production build disallows everything');
if (preview && existsSync(join(dist, 'sitemap-index.xml'))) fail('sitemap-index.xml', 'PREVIEW build should not have a sitemap');

// Every event page carries exactly one schema.org Event about itself (Google's rule: one event per
// page, marked up on that page), and the listing links to every event page.
const eventPages = htmlFiles.filter((f) => /\/events\/[^/]+\/index\.html$/.test(f));
const listing = existsSync(join(dist, 'events/index.html')) ? readFileSync(join(dist, 'events/index.html'), 'utf8') : '';
for (const file of eventPages) {
  const where = relative(dist, file);
  const doc = docFor(file);
  const canonical = DomUtils.findOne((n) => n.name === 'link' && n.attribs.rel === 'canonical', doc.children)?.attribs.href;
  const blocks = DomUtils.findAll((n) => n.name === 'script' && n.attribs.type === 'application/ld+json', doc.children)
    .map((n) => { try { return JSON.parse(DomUtils.textContent(n)); } catch { return null; } });
  const evs = blocks.filter((b) => b?.['@type'] === 'Event');
  if (evs.length > 1) fail(where, `${evs.length} Event JSON-LD blocks (one per page)`);
  const ev = evs[0];
  if (ev) {
    if (canonical && ev.url !== canonical) fail(where, `Event url ${ev.url} is not the page's canonical ${canonical}`);
    if (!ev.name || !ev.startDate) fail(where, 'Event JSON-LD needs name and startDate');
    if (ev.location?.['@type'] !== 'Place' || ev.location?.address?.['@type'] !== 'PostalAddress') fail(where, 'Event location must be a Place with a PostalAddress');
    for (const u of [ev.image ?? []].flat()) if (!/^https?:\/\//.test(u)) fail(where, `Event image ${u} is not absolute`);
  }
  const path = new URL(canonical ?? 'https://x/').pathname;
  if (!listing.includes(`href="${path}"`)) fail('events/index.html', `does not link to ${path}`);
}

// The public feed (/feed/events.json, read by the SnapPages widget) lists exactly the events on
// /events/, with absolute URLs that resolve, and only the documented fields.
const FEED_KEYS = ['id', 'title', 'summary', 'starts_at', 'ends_at', 'all_day', 'timezone', 'live_until', 'date_label', 'time_label', 'badge',
  'more_dates', 'location_name', 'city', 'price_label', 'free', 'image_url', 'image_width', 'image_height', 'register_url', 'details_url',
  'church_center_url', 'full', 'registration', 'status_label'];
if (!existsSync(join(dist, 'feed/events.json'))) fail('feed/events.json', 'missing (the SnapPages widget reads it)');
else if (existsSync(join(dist, 'events/index.html'))) {
  let feed = {};
  try { feed = JSON.parse(readFileSync(join(dist, 'feed/events.json'), 'utf8')); } catch (e) { fail('feed/events.json', `not valid JSON: ${e.message}`); }
  const count = /data-events-count="(\d+)"/.exec(readFileSync(join(dist, 'events/index.html'), 'utf8'))?.[1];
  if (feed.version !== 1) fail('feed/events.json', `version ${feed.version}, expected 1`);
  if (String(feed.events?.length) !== count) fail('feed/events.json', `${feed.events?.length} events but /events/ lists ${count}`);
  if (feed.preview !== preview) fail('feed/events.json', `preview is ${feed.preview} in a ${preview ? 'PREVIEW' : 'production'} build`);
  for (const e of feed.events ?? []) {
    const extra = Object.keys(e).filter((k) => !FEED_KEYS.includes(k));
    if (extra.length) fail('feed/events.json', `event ${e.id} has undocumented field(s) ${extra.join(', ')}`);
    for (const k of ['image_url', 'register_url', 'details_url', 'church_center_url']) {
      if (e[k] != null && !/^https?:\/\//.test(e[k])) fail('feed/events.json', `event ${e.id} ${k} is not absolute`);
    }
    for (const k of ['details_url', 'image_url']) if (e[k]) checkRef(`feed/events.json event ${e.id} ${k}`, new URL(e[k]).pathname, join(dist, 'index.html'));
  }
}

const pages = htmlFiles.length;
if (problems.length) {
  const unique = [...new Set(problems)];
  console.error(`check-dist: ${unique.length} problem(s) in ${pages} HTML files (base ${base}${preview ? ', PREVIEW' : ''}):\n  - ${unique.join('\n  - ')}`);
  process.exit(1);
}
console.log(`check-dist: OK. ${pages} HTML files, every internal link, asset and anchor resolves (base ${base}${preview ? ', PREVIEW' : ''}).`);
