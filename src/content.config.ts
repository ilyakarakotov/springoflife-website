// Markdown pages (About, Give). YAML content, including the Visit page, is loaded and validated in src/lib/content.ts.
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { showPlaceholders, stripPlaceholders } from './lib/placeholders.mjs';

// [Placeholder] text in the front matter is left out of builds, like in the body (astro.config.mjs).
const text = () => z.string().transform((s) => (showPlaceholders() ? s : stripPlaceholders(s) ?? undefined));

const pages = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    intro: text().optional(),
  }),
});

export const collections = { pages };
