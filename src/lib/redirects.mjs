// Old springoflifechurch.com (SnapPages) URLs and where they live now.
// Used by astro.config.mjs (meta-refresh pages for GitHub Pages), the Cloudflare `_redirects`
// file written at build time, and the 404 page (old sermon URLs).
//
// Only pages with a real equivalent are listed (Google treats mass redirects to the home page as
// soft 404s). Retired pages (/mission-vision, /ukraine-support, /home-2, /blog/*, lorem-ipsum
// pages) are intentionally left to 404 so search engines drop them.

export const REDIRECTS = {
  '/home': '/',
  '/i-m-new': '/visit',
  '/contact': '/visit#contact',
  '/leadership': '/about#leadership',
  '/what-we-believe': '/about#beliefs',
  '/giving': '/give',
  '/watch-live': '/watch',
  '/media': '/watch',
  '/subsplash-media': '/watch',
  '/groups': '/life-groups',
  '/small-groups': '/life-groups',
  '/small-groups-20-groups': '/life-groups',
  '/small-groups-less-than-20-groups': '/life-groups',
  '/children': '/ministries#kids',
  '/young-adults': '/ministries#young-adults',
  '/missions': '/ministries#missions',
  '/kreshchenie': '/next-steps#baptism',
  '/resources': '/next-steps',
  '/connect-card': '/next-steps#connect',
  '/prayer-request': '/next-steps#prayer',
  '/volunteer': '/next-steps#serve',
  '/volunteer-signup': '/next-steps#serve',
  '/event-signup': '/events',
};

/** Old links to the Russian-language pages go to the Russian site. */
export const EXTERNAL_REDIRECTS = {
  '/russian': 'https://www.springoflifechurchru.com',
};

// SnapPages served Subsplash sermons at /media/<code>/<slug> and series at
// /media/series/<code>/<slug>. The same short code works on Subsplash's own site
// (checked: /media/mi/+2ngjnmk -> "Grace To Grace", /media/ms/+9mjyhrw -> "LETTER to ROMANS").
export const SUBSPLASH_MEDIA = 'https://subsplash.com/springoflifechurch/media';
const MEDIA_ITEM = /^\/media\/(?!series\/)([a-z0-9]{5,10})(?:\/[^/]*)?\/?$/i;
const MEDIA_SERIES = /^\/media\/series\/([a-z0-9]{5,10})(?:\/[^/]*)?\/?$/i;

/**
 * Where an old /media/... URL should go, or null if it isn't one: the same sermon or series on
 * Subsplash when the URL carries its code, otherwise the Watch page ("/watch/", a site path).
 * Nothing on this site is served under /media/ (synced images live under /_astro/).
 * @param {string} path  path without the site's base, e.g. "/media/2ngjnmk/grace-to-grace"
 */
export function legacyMediaTarget(path) {
  const item = MEDIA_ITEM.exec(path);
  if (item) return `${SUBSPLASH_MEDIA}/mi/+${item[1]}`;
  const series = MEDIA_SERIES.exec(path);
  if (series) return `${SUBSPLASH_MEDIA}/ms/+${series[1]}`;
  if (/^\/media\/./i.test(path)) return '/watch/';
  return null;
}
