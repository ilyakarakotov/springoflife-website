// Loads the editable YAML content (src/content/*.yaml) and the synced feeds (src/data/*.json).
// Every file is validated at build time, so a typo made in the CMS fails the build with a clear
// message instead of publishing a broken page.
import { parse } from 'yaml';
import { z } from 'astro/zod';
import type { ImageMetadata } from 'astro';
import siteRaw from '../content/site.yaml?raw';
import homeRaw from '../content/home.yaml?raw';
import ministriesRaw from '../content/ministry-links.yaml?raw';
import stepsRaw from '../content/next-steps.yaml?raw';
import leadersRaw from '../content/leaders.yaml?raw';
import beliefsRaw from '../content/beliefs.yaml?raw';
import groupOverridesRaw from '../content/group-overrides.yaml?raw';
import eventsData from '../data/events.json';
import groupsData from '../data/groups.json';
import { isLive } from './events.mjs';
import { AUDIENCES } from './groups.mjs';
import { hidePlaceholders, showPlaceholders } from './placeholders.mjs';

/** SHOW_PLACEHOLDERS=true: a draft build that keeps [placeholder] text, marked "Needs text". */
export const SHOW_PLACEHOLDERS = showPlaceholders();

const images = import.meta.glob<{ default: ImageMetadata }>('/src/assets/**/*.{jpg,jpeg,png,webp,avif}', { eager: true });

/** Resolve a CMS image path ("/src/assets/photos/x.jpg") to an optimizable Astro image. */
export function img(path: string): ImageMetadata {
  const key = path.startsWith('/') ? path : `/${path}`;
  const mod = images[key];
  if (!mod) throw new Error(`Image not found: ${path}. Put it in src/assets/ and use the path starting with /src/assets/.`);
  return mod.default;
}

/** Parse and validate a YAML file. [Placeholder] text is removed first (src/lib/placeholders.mjs). */
function load<T extends z.ZodType>(name: string, raw: string, schema: T): z.infer<T> {
  const data = parse(raw);
  const result = schema.safeParse(SHOW_PLACEHOLDERS ? data : hidePlaceholders(data));
  if (!result.success) {
    throw new Error(`src/content/${name} is invalid:\n${z.prettifyError(result.error)}\n`
      + '(Text in [square brackets] is a placeholder and is left out of the site, so a required field cannot be only a placeholder.)');
  }
  return result.data;
}

const url = z.string().regex(/^(https:\/\/|\/)/, 'must start with https:// or /');
const imagePath = z.string().regex(/^\/src\/assets\//, 'must start with /src/assets/');
/** Optional field that also accepts the empty values a CMS writes for a cleared input. */
const opt = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === '' || v === null ? undefined : v), schema.optional());

export const site = load('site.yaml', siteRaw, z.object({
  name: z.literal('Spring of Life Church'),
  tagline: z.string(),
  mission: z.string(),
  description: z.string(),
  service: z.object({ day: z.string(), time: z.string(), start_24h: z.string(), length: z.string(), russian_time: z.string() }),
  address: z.object({
    street: z.string(), city: z.string(), region: z.string(), postal_code: z.string(), country: z.string(),
    lat: z.number(), lng: z.number(), maps_url: url,
  }),
  phone: z.string(),
  email: z.string(),
  // Every key the templates use is required, so a deleted link fails the build instead of
  // rendering href="undefined".
  links: z.object({
    church_center: url, signups: url, groups: url, youtube: url, youtube_live: url, instagram: url,
    facebook: url, russian_site: url, sermons: url, bulletin: url, give: url, app_ios: url, app_android: url,
    app_ios_id: z.coerce.string(),
  }),
  embeds: z.object({ latest_sermon: url, give: url }),
}));

export const home = load('home.yaml', homeRaw, z.object({
  hero: z.object({ headline: z.string(), image: imagePath, image_alt: z.string() }),
  // The quick-link photos are decorative; image_focus picks which part of the photo the card shows.
  quick_links: z.array(z.object({
    kicker: opt(z.string()), title: z.string(), url, image: imagePath,
    image_focus: z.preprocess((v) => (v === '' || v === null ? undefined : v), z.enum(['center', 'left', 'right']).default('center')),
  })).length(4),
  sunday: z.object({ title: z.string(), points: z.array(z.string()) }),
  groups: z.object({ eyebrow: z.string(), title: z.string(), text: z.string() }),
  give: z.object({ title: z.string(), text: z.string() }),
  app: z.object({ title: z.string(), text: z.string() }),
}));

const Ministry = z.object({
  id: z.string(),
  group: z.enum(['kids', 'adults', 'schools', 'serve']),
  title: z.string(),
  summary: z.string(),
  details: opt(z.array(z.string())),
  signup_id: opt(z.coerce.string().regex(/^\d+$/, 'signup_id is the number from the Church Center signup URL')),
  link: opt(url),
  cta: opt(z.string()),
  image: opt(imagePath),
  image_fit: z.preprocess((v) => (v === '' || v === null ? undefined : v), z.enum(['photo', 'logo']).default('photo')),
  weekly: opt(z.string()),
}).refine((m) => !(m.signup_id && m.link), 'use either signup_id or link, not both');

export const ministries = load('ministry-links.yaml', ministriesRaw, z.object({ ministries: z.array(Ministry) })).ministries
  .map((m) => ({ ...m, href: m.signup_id ? `${site.links.church_center}/registrations/events/${m.signup_id}` : m.link }));

export const steps = load('next-steps.yaml', stepsRaw, z.object({
  steps: z.array(z.object({
    id: z.string(), title: z.string(), text: z.string(), url, cta: z.string(),
    secondary_url: opt(url), secondary_cta: opt(z.string()), home: opt(z.boolean()), image: opt(imagePath),
  })),
})).steps;

/** Church Center forms used outside the Next Steps page (footer, Visit, Home) come from next-steps.yaml,
 *  so a form that gets replaced in Planning Center is updated in one place. */
function stepUrl(id: string): string {
  const step = steps.find((s) => s.id === id);
  if (!step) throw new Error(`src/content/next-steps.yaml needs a step with id "${id}" (the footer and Visit page link to it).`);
  return step.url;
}
export const forms = { connect: stepUrl('connect'), prayer: stepUrl('prayer'), serve: stepUrl('serve') };

export const leaders = load('leaders.yaml', leadersRaw, z.object({
  leaders: z.array(z.object({ name: z.string(), role: z.string(), photo: imagePath })),
})).leaders;

export const beliefs = load('beliefs.yaml', beliefsRaw, z.object({
  intro: z.string(),
  beliefs: z.array(z.object({ title: z.string(), text: z.string() })),
  show_affiliations: z.boolean(),
  statement: z.object({ label: z.string(), url, text: z.string() }),
  affiliations: z.array(z.object({ name: z.string(), url })),
}));

// ---- Synced feeds (written by scripts/sync.mjs) ----
// Schema documented in README "Data files". Validated here too, so a hand-edited or half-written
// file fails the build with a clear message instead of rendering "undefined". Fields added later
// have defaults, so older data files still build.
const iso = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'must be an ISO date');
const https = z.string().regex(/^https:\/\//, 'must start with https://');
const nullable = <T extends z.ZodType>(schema: T) => schema.nullable().default(null);
/** A file the sync wrote to src/assets/sync/ (resolved by src/lib/media.ts). */
const syncedFile = z.string().regex(/^(signup|group)-[\w-]+-[0-9a-f]{12}\.(jpg|png|webp|gif|avif)$/, 'must be a file name in src/assets/sync/ (re-run the sync)');
const Occurrence = z.object({ starts_at: iso, ends_at: nullable(iso), all_day: z.boolean().default(false) });
const Postal = z.object({ street: z.string(), locality: z.string(), region: z.string(), postal_code: nullable(z.string()), country: z.string().default('US') });
const SyncedEventSchema = z.object({
  id: z.string().regex(/^\d+$/),
  title: z.string().min(1),
  summary: z.string().default(''),
  description_html: z.string().default(''),
  starts_at: nullable(iso),
  ends_at: nullable(iso),
  all_day: z.boolean().default(false),
  more_times: z.array(Occurrence).default([]),
  location: nullable(z.object({
    name: nullable(z.string()),
    address: nullable(z.string()),
    city: nullable(z.string()),
    postal: nullable(Postal),
    type: nullable(z.string()),
  })),
  price: nullable(z.object({ free: z.boolean(), min_cents: z.number(), max_cents: z.number(), label: z.string() })),
  image: nullable(syncedFile),
  register_url: nullable(https),
  details_url: https,
  registration: z.object({ open: z.boolean(), full: z.boolean(), opens_at: nullable(iso), closes_at: nullable(iso) }),
  updated_at: nullable(z.string()),
  source: z.string().default('unknown'),
});
// Only card fields: the leaders' bio is never stored (scripts/lib/groups.mjs). `strict()` makes an
// old data file that still carries a bio or an address fail the build instead of being published.
const SyncedGroupSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  schedule: nullable(z.string()),
  area: nullable(z.string().regex(/^\D*$/, 'must not contain digits')),
  audience: nullable(z.enum(AUDIENCES as [string, ...string[]])),
  virtual: z.boolean().default(false),
  enrollment: z.object({ status: nullable(z.string()), strategy: nullable(z.string()) }),
  image: nullable(syncedFile),
  url: https,
  updated_at: nullable(z.string()),
  source: z.string().default('unknown'),
}).strict();
export type Occurrence = z.infer<typeof Occurrence>;
export type SyncedEvent = z.infer<typeof SyncedEventSchema>;
export type SyncedGroup = z.infer<typeof SyncedGroupSchema>;

function loadFeed<T extends z.ZodType>(name: string, data: unknown, schema: T): z.infer<T>[] {
  const result = z.array(schema).safeParse(data);
  if (!result.success) throw new Error(`src/data/${name} is invalid (it is written by scripts/sync.mjs; re-run the sync):\n${z.prettifyError(result.error)}`);
  return result.data;
}

const buildTime = new Date();
/** Upcoming events, re-checked at build time so an ended event never shows even if a sync was missed.
 *  Every occurrence counts, so a multi-date event stays until its last date (P2-13). */
export const events = loadFeed('events.json', eventsData, SyncedEventSchema).filter((e) => isLive(e, buildTime));
/** Per-group exceptions edited by staff (src/content/group-overrides.yaml). */
const groupOverrides = load('group-overrides.yaml', groupOverridesRaw, z.object({
  groups: z.array(z.object({
    id: z.coerce.string().regex(/^\d+$/, 'id is the number from the group\'s Planning Center address'),
    image: opt(z.union([z.literal('none'), imagePath])),
    note: opt(z.string()),
  })).default([]),
})).groups;

/** A group card's picture: the synced PCO header image, a church photo chosen by staff, or none. */
export type GroupImage = { kind: 'synced'; file: string } | { kind: 'asset'; path: string } | { kind: 'none' };
export type PublicGroup = SyncedGroup & { picture: GroupImage };

export const groups: PublicGroup[] = loadFeed('groups.json', groupsData, SyncedGroupSchema).map((g) => {
  const o = groupOverrides.find((x) => x.id === g.id)?.image;
  const picture: GroupImage = o === 'none' ? { kind: 'none' } : o ? { kind: 'asset', path: o } : g.image ? { kind: 'synced', file: g.image } : { kind: 'none' };
  return { ...g, picture };
});
export { buildTime };

/** Open external links (Church Center, Subsplash, YouTube) in a new tab; keep site links in the same tab. */
export const external = (href: string) => (/^https?:\/\//.test(href) ? { target: '_blank', rel: 'noopener' } : {});
