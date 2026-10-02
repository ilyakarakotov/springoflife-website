# Working in this repo

This is the English website for Spring of Life Church (Mukilteo, WA). It's an Astro static site with a deterministic Planning Center sync. It will replace the current SnapPages site at springoflifechurch.com.

Read `README.md` first: it covers the architecture, the sync, settings, hosting and going live. `docs/HANDOFF.md` lists the remaining setup steps, and `docs/QUESTIONS-FOR-PASTORS.md` lists the open content questions.

## Commands

```sh
npm ci
npm test            # sync unit tests (node:test)
npm run check       # astro check (types)
npm run build       # static build into dist/
npm run check:dist  # smoke-tests dist/: links, fragments, JSON-LD, noindex, no third-party loads, feed, placeholders
npm run sync:cc     # refresh data from Church Center (prototype adapter, no token)
```

Before calling work done, run `npm test`, `npm run check`, `npm run build` and `npm run check:dist`. For UI changes, also look at the pages at 390 px and 1440 px wide, in light and dark.

## Rules

- **This repo is public.** Never commit:
  - tokens or secrets
  - meeting notes or transcripts
  - account findings
  - anyone's home address, personal phone or email
  - children's names, ages or details
  - family details

  Secrets go in GitHub Actions secrets only (`PCO_APP_ID`, `PCO_SECRET`).
- **Name:** "Spring of Life Church" everywhere. Never "Baptist" in branding.
- **Photos:** use only real church photos (`src/assets/photos/`). No AI-generated images. No photos of identifiable children until consent is confirmed. No building photo that shows the old "Slavic Baptist Church" sign.
- **Events** come only from Planning Center Registrations signups in category 111199. Ongoing ministries (AWANA, Russian School, Music Academy, Kids Choir) are stable links in `src/content/ministry-links.yaml`, not events.
- **Life Groups** come from PCO Groups, "English Life Groups" type only. Cards show day, area and a neutral one-liner, and the details stay on Church Center.
- **Sermons and giving stay on Subsplash** (embeds and links in `src/content/site.yaml`).
- The sync is deterministic code, with no AI in the loop. Keep it fail-closed: bad or empty upstream data must never wipe the published site.
- **Quality bar:**
  - WCAG 2.2 AA
  - Lighthouse 100 on every page (mobile and desktop)
  - all content readable without JavaScript
  - no trackers or cookies by default
  - no layout shift
  - works from 320 px to 1440 px with no horizontal scroll
- Content that staff edit lives in `src/content/` (Pages CMS forms in `.pages.yml`). Keep field names stable, and update `.pages.yml` when a content file's shape changes.
- Don't change `.github/workflows/`, repository settings, the hosting setup or the sync adapter without the owner's go-ahead.
- Don't edit the live springoflifechurch.com (SnapPages) site from here.
- Make one focused change per pull request, with clear commit messages.
