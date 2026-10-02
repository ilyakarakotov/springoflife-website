// Images copied from Planning Center by the sync (src/assets/sync/, content-hashed names). They go
// through Astro's image pipeline like every other photo: responsive AVIF/WebP with width/height,
// and they're emitted under /_astro/, so nothing the site serves lives under the old SnapPages
// /media/... sermon URLs (those redirect to Subsplash, see src/lib/redirects.mjs).
import type { ImageMetadata } from 'astro';

const synced = import.meta.glob<{ default: ImageMetadata }>('/src/assets/sync/*.{jpg,jpeg,png,webp,gif,avif}', { eager: true });

/** The image for a synced file name ("signup-3894463-a014ac68ca5a.jpg"), or null when there is none. */
export function syncedImage(file: string | null | undefined): ImageMetadata | null {
  if (!file) return null;
  const mod = synced[`/src/assets/sync/${file}`];
  if (!mod) throw new Error(`Synced image ${file} is missing from src/assets/sync/. Re-run the sync (npm run sync) or restore the file from git.`);
  return mod.default;
}

/** Responsive widths for 720×405 card images (PCO's own thumbnail size). */
export const CARD_WIDTHS = [400, 720];
