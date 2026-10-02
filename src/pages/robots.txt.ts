import type { APIRoute } from 'astro';
import { PREVIEW } from 'astro:env/server';
import { absoluteUrl } from '../lib/url';

// PREVIEW builds block every crawler. Note that crawlers only read /robots.txt at the root of a
// host, so a preview under a sub-path (<user>.github.io/<repo>/) relies on the noindex <meta> tag.
export const GET: APIRoute = () =>
  new Response(
    PREVIEW
      ? 'User-agent: *\nDisallow: /\n'
      : `User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl('/sitemap-index.xml')}\n`,
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
