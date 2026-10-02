// Tiny blurred previews ("LQIP") for the photos that paint first (home hero, quick-link cards,
// page photos). Each is a ~32 px wide WebP inlined as a data: URI (about 0.5 KB), drawn under the
// real <picture>. So the first paint shows a soft version of the real photo, never an empty dark
// block, even on a slow phone connection or when the full image fails to load.
// The CSP allows data: images (astro.config.mjs, img-src).
import sharp from 'sharp';
import { join } from 'node:path';

export interface Preview { src: string; width: number; height: number }
const cache = new Map<string, Promise<Preview>>();

/** A blurred preview of a source image ("/src/assets/photos/worship.jpg"): data URI plus its size. */
export function lqip(path: string, width = 32): Promise<Preview> {
  const key = `${path}@${width}`;
  if (!cache.has(key)) {
    const file = join(process.cwd(), path.replace(/^\//, ''));
    cache.set(key, sharp(file).rotate().resize({ width }).modulate({ saturation: 1.1 }).blur(0.6).webp({ quality: 45 })
      .toBuffer({ resolveWithObject: true })
      .then(({ data, info }) => ({ src: `data:image/webp;base64,${data.toString('base64')}`, width: info.width, height: info.height })));
  }
  return cache.get(key)!;
}
