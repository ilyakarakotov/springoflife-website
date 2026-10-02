// /feed/events.json: upcoming website events for other sites (the SnapPages widget). Built with the
// site, so it always matches /events/. Schema and stability rules: src/lib/feed.mjs and
// docs/SNAPPAGES-EVENTS-EMBED.md. Hosts must send Access-Control-Allow-Origin: * for it
// (GitHub Pages does by default; Cloudflare Pages gets it from public/_headers).
import type { APIRoute } from 'astro';
import { getImage } from 'astro:assets';
import { PREVIEW } from 'astro:env/server';
import { events, site, buildTime } from '../../lib/content';
import { eventPath } from '../../lib/events.mjs';
import { buildEventsFeed } from '../../lib/feed.mjs';
import { syncedImage } from '../../lib/media';
import { absoluteUrl, absoluteAsset } from '../../lib/url';

export const GET: APIRoute = async () => {
  const images = new Map<string, { url: string; width: number; height: number }>();
  for (const e of events) {
    const meta = syncedImage(e.image);
    if (!meta) continue;
    // Same transform as the event page's social preview, so it's one file.
    const out = await getImage({ src: meta, width: meta.width, height: meta.height, fit: 'cover', format: 'jpg', quality: 80 });
    images.set(e.id, { url: absoluteAsset(out.src), width: meta.width, height: meta.height });
  }
  const feed = buildEventsFeed(events, {
    now: buildTime,
    preview: PREVIEW,
    site: {
      name: site.name,
      url: absoluteUrl('/'),
      events_url: absoluteUrl('/events'),
      signups_url: site.links.signups,
    },
    pageUrl: (e) => absoluteUrl(eventPath(e)),
    imageFor: (e) => images.get(e.id) ?? null,
  });
  return new Response(`${JSON.stringify(feed, null, 2)}\n`, { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
