// Plain-JS path helpers shared by astro.config.mjs, the site and the tests.

/**
 * Add a trailing slash to a page path, keeping any ?query and #fragment:
 * "/visit" -> "/visit/", "/visit#kids" -> "/visit/#kids", "/" -> "/".
 * Paths whose last segment has a dot ("/events.ics", "/feed/events.json") are files and stay as-is.
 * @param {string} path
 */
export function withTrailingSlash(path) {
  const [, p = '', rest = ''] = /^([^?#]*)(.*)$/s.exec(path) ?? [];
  const last = p.split('/').pop() ?? '';
  return (p === '' ? '/' : p.endsWith('/') || last.includes('.') ? p : `${p}/`) + rest;
}

/**
 * Normalize a base path to "/" or "/segment/…/".
 * @param {string | undefined} base
 */
export function normalizeBase(base) {
  const trimmed = String(base ?? '').replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}/` : '/';
}
