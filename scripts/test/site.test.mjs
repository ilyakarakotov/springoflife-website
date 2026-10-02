// Tests for site-side helpers that don't need an Astro build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serializeJsonLd } from '../../src/lib/serialize.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '../..');
const LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);

test('JSON-LD serialization cannot close its <script> element (stored XSS regression)', () => {
  const evil = {
    name: '</script><img src=x onerror=alert(document.domain)>',
    description: `<!-- & ]]> </SCRIPT > line${LS}para${PS}end`,
  };
  const out = serializeJsonLd(evil);
  assert.ok(!/[<>&]/.test(out), out);
  assert.ok(!out.includes(LS) && !out.includes(PS), 'line/paragraph separators are escaped');
  assert.deepEqual(JSON.parse(out), evil, 'still the same JSON for every parser');
});

test('every inline JSON-LD block in src/ goes through serializeJsonLd', () => {
  const files = [];
  const walk = (dir) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(astro|ts|mjs)$/.test(f)) files.push(p);
    }
  };
  walk(join(repo, 'src'));
  for (const f of files) {
    const s = readFileSync(f, 'utf8');
    assert.ok(!/set:html=\{\s*JSON\.stringify/.test(s), `${f}: use serializeJsonLd() instead of JSON.stringify in set:html`);
    for (const m of s.matchAll(/application\/ld\+json[^>]*set:html=\{([^}]*)\}/g)) {
      assert.match(m[1], /serializeJsonLd\(/, `${f}: JSON-LD must be serialized with serializeJsonLd()`);
    }
  }
});

import { withTrailingSlash, normalizeBase } from '../../src/lib/paths.mjs';
import { REDIRECTS, legacyMediaTarget } from '../../src/lib/redirects.mjs';

test('page paths get a trailing slash; files, queries and fragments are kept', () => {
  assert.equal(withTrailingSlash('/'), '/');
  assert.equal(withTrailingSlash(''), '/');
  assert.equal(withTrailingSlash('/visit'), '/visit/');
  assert.equal(withTrailingSlash('/visit/'), '/visit/');
  assert.equal(withTrailingSlash('/visit#contact'), '/visit/#contact');
  assert.equal(withTrailingSlash('/events?x=1#a'), '/events/?x=1#a');
  assert.equal(withTrailingSlash('/events.ics'), '/events.ics');
  assert.equal(withTrailingSlash('/feed/events.json'), '/feed/events.json');
  assert.equal(normalizeBase(undefined), '/');
  assert.equal(normalizeBase('/'), '/');
  assert.equal(normalizeBase('springoflife-website'), '/springoflife-website/');
  assert.equal(normalizeBase('/springoflife-website/'), '/springoflife-website/');
});

test('old SnapPages sermon URLs map to the same sermon on Subsplash', () => {
  assert.equal(legacyMediaTarget('/media/2ngjnmk/grace-to-grace'), 'https://subsplash.com/springoflifechurch/media/mi/+2ngjnmk');
  assert.equal(legacyMediaTarget('/media/2ngjnmk'), 'https://subsplash.com/springoflifechurch/media/mi/+2ngjnmk');
  assert.equal(legacyMediaTarget('/media/series/9mjyhrw/letter-to-romans/'), 'https://subsplash.com/springoflifechurch/media/ms/+9mjyhrw');
  assert.equal(legacyMediaTarget('/media'), null, '/media itself is a normal redirect to /watch');
  assert.equal(legacyMediaTarget('/visit'), null);
  assert.equal(legacyMediaTarget('/media/a/b/c'), '/watch/', 'any other old /media/ URL goes to the Watch page');
  assert.equal(legacyMediaTarget('/media/group-1568405-a16e0f7e25a9.jpg'), '/watch/', 'no synced image lives under /media/ any more');
  for (const [from, to] of Object.entries(REDIRECTS)) {
    assert.match(from, /^\/[a-z0-9-]+$/, `${from} is a plain old path`);
    assert.match(to, /^\/[a-z-]*(#[a-z-]+)?$/, `${to} is a site path`);
  }
});
