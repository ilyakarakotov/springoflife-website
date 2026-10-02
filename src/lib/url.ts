// Every internal link, asset and canonical URL goes through these helpers, so the same build
// works at a domain root (springoflifechurch.com, *.pages.dev) and under a sub-path
// (<user>.github.io/<repo>/). The base path comes from BASE_PATH / SITE_URL (astro.config.mjs).
import { withTrailingSlash } from './paths.mjs';

/** "" at a domain root, "/springoflife-website" under a sub-path (never a trailing slash). */
export const BASE = import.meta.env.BASE_URL.replace(/\/+$/, '');

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i; // https:, mailto:, tel:, webcal:, //host

/**
 * Site path -> href. "/visit" -> "/<base>/visit/", "/visit#kids" -> "/<base>/visit/#kids",
 * "/events.ics" -> "/<base>/events.ics". External URLs and "#fragments" pass through unchanged.
 * Page URLs get a trailing slash so static hosts serve them without a redirect.
 */
export function href(path: string): string {
  if (EXTERNAL.test(path) || path.startsWith('#')) return path;
  return BASE + withTrailingSlash(path.startsWith('/') ? path : `/${path}`);
}

/** Absolute URL for canonical links, feeds, JSON-LD and social previews. */
export function absoluteUrl(path: string): string {
  return EXTERNAL.test(path) ? path : new URL(href(path), import.meta.env.SITE).href;
}

/** Absolute URL for an asset src Astro already resolved (getImage, ?url imports): those include the base. */
export function absoluteAsset(src: string): string {
  return new URL(src, import.meta.env.SITE).href;
}

/** The page path without the base and without a trailing slash ("/" for the home page). */
export function pagePath(pathname: string): string {
  const p = BASE && pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname;
  return p.replace(/\/+$/, '') || '/';
}

export const isExternal = (url: string) => /^https?:\/\//i.test(url);
