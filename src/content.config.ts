// Markdown pages (Visit, About, Give). YAML content is loaded and validated in src/lib/content.ts.
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const pages = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    intro: z.string().optional(),
  }),
});

export const collections = { pages };
