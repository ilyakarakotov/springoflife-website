# Spring of Life Church website (English)

A static website for Spring of Life Church in Mukilteo, WA. Events and Life Groups come straight
from Planning Center through a small, deterministic sync script (no AI in that path). Sermons and
giving stay on Subsplash. They're embedded, and load only when a visitor clicks. Page text lives
in Markdown and YAML files that staff edit through Pages CMS. A public events feed and a
small widget put the same events on the current SnapPages site today.

**Status: prototype, not deployed.** The code is in a private GitHub repository. Both workflows
stay off until someone turns them on (see [Going live](#going-live)). Deployed builds are
**preview builds** (noindex) unless the repository variable `PRODUCTION` is `true`.

## Runbook: something is red

1. You got an email about a GitHub issue titled **"Planning Center sync is failing"** or **"Website
   deploy is failing"**, or Healthchecks alerted you.
2. Open the link in the issue (the failed run). Click the red step.
3. Read the line that starts with `SYNC FAILED`, `SYNC PARTIAL` or `::error::`.
4. Find it in [When something fails](#when-something-fails) and do what it says.
5. Re-run: **Actions → (the workflow) → Run workflow**. The issue closes itself when a run succeeds.

The site never goes blank. A failed sync keeps the last good data, and a failed deploy keeps the
last good site.

## How it fits together

```
 Department leader                  Life Group leaders              Nick
 PCO Registrations signup           PCO Groups                      Subsplash upload
 + the website category             ("English Life Groups" type)    (sermons, giving)
          │                                  │                            │
          └───────────────┬──────────────────┘                            │
                          ▼                                               │
   scripts/sync.mjs   (GitHub Actions, every 30 min, deterministic)       │
     adapter "pco"          official API + Personal Access Token          │
     adapter "churchcenter" undocumented web API, prototype only          │
     → only website-category events, only English Life Groups             │
     → clean + redact the text, drop ended events, copy images            │
     → Life Groups: day, time, area and group type only (never the bios)  │
     → src/data/*.json, src/assets/sync/* (images), public/events.ics     │
     → commits ONLY when something changed; a feed that fails keeps its   │
       last good data                                                     │
                          ▼                                               │
   astro build  →  dist/  →  GitHub Pages (or Cloudflare Pages)  ◄── click-to-load embeds
     every page, /events/<title>-<id>/ per event, /feed/events.json,      (latest sermon, Give)
     /embed/sol-events.js (SnapPages widget)
                          ▲
   Pages CMS edits  →  src/content/*.yaml, src/content/pages/*.md

   Visitors click "Register" / "Request to join" → Church Center (springoflifechurch.churchcenter.com)
```

Staff keep working in Planning Center and Subsplash as they do today. The website only reads
from them.

## Run it locally

Needs Node 22 (`.nvmrc`).

```bash
npm ci
npm run sync:cc     # pull live data via the prototype Church Center adapter (no token needed)
npm run dev         # http://localhost:4321
npm test            # unit + sync tests (offline, mocked network)
npm run check       # astro check (types)
npm run build       # static site in dist/
npm run check:dist  # crawl dist/: links, assets, anchors, JSON-LD, the feed, noindex, no third-party loads
npm run preview     # serve dist/ locally
```

`npm run sync` uses `SYNC_ADAPTER` from the environment or `.env` (default `pco`, which needs a
token). Copy `.env.example` to `.env` for local settings. To build like the GitHub Pages preview:

```bash
SITE_URL=https://ilyakarakotov.github.io/springoflife-website/ PREVIEW=true npm run build
SITE_URL=https://ilyakarakotov.github.io/springoflife-website/ PREVIEW=true npm run check:dist
```

## Settings

### Environment variables (local `.env`, or set by the workflows)

| Name | Default | What it does |
|---|---|---|
| `SYNC_ADAPTER` | `pco` | `pco` for production, `churchcenter` for the prototype |
| `ALLOW_PROTOTYPE_ADAPTER` | unset | `1` lets the `churchcenter` adapter run in GitHub Actions. Without it, the run is refused there so production can't switch to the undocumented API by accident |
| `PCO_APP_ID`, `PCO_SECRET` | none | Personal Access Token (Application ID and Secret) |
| `PCO_WEBSITE_CATEGORY_ID` | `111199` | Registrations category that publishes a signup. Matched by **ID**: it's named `"Website Category "` (trailing space) today and can be renamed safely |
| `PCO_LIFE_GROUP_TYPE_ID` | `222818` | Groups type "English Life Groups" |
| `SITE_URL` | `https://springoflifechurch.com` | Public address: canonical links, sitemap, social previews, the feed, the calendar. `https://<owner>.github.io/springoflife-website/` for the GitHub Pages preview |
| `BASE_PATH` | path of `SITE_URL` | Only if the site lives under a different sub-path. Empty means unset |
| `PREVIEW` | `false` | `true`: every page `noindex,nofollow`, robots.txt `Disallow: /`, no sitemap, and the feed says `"preview": true` |
| `SYNC_ALLOW_EMPTY` | off | `1` or `true` accepts an empty list when the site still lists 3 or more current items |
| `SYNC_NOW` | now | Pretend it's another time (testing the "ended" logic) |
| `HC_PING_URL` | none | Healthchecks.io check URL |

### GitHub repository settings (Settings → Secrets and variables → Actions)

| Kind | Name | Value |
|---|---|---|
| Variable | `SITE_AUTOMATION_ENABLED` | `true` turns both workflows on |
| Variable | `SITE_URL` | e.g. `https://ilyakarakotov.github.io/springoflife-website/` (later `https://springoflifechurch.com`) |
| Variable | `BASE_PATH` | leave unset (derived from `SITE_URL`) |
| Variable | `PRODUCTION` | `true` only at launch. Anything else builds a noindex preview |
| Variable | `SYNC_ADAPTER` | `pco` (default) or `churchcenter` until a token exists |
| Variable | `ALLOW_PROTOTYPE_ADAPTER` | `1` when `SYNC_ADAPTER=churchcenter` |
| Variable | `PCO_WEBSITE_CATEGORY_ID`, `PCO_LIFE_GROUP_TYPE_ID` | only if the IDs change |
| Variable | `DEPLOY_TARGET` | `github-pages` (default) or `cloudflare` |
| Variable | `CLOUDFLARE_PROJECT`, `CLOUDFLARE_ACCOUNT_ID` | only for Cloudflare |
| Variable | `ALERT_MENTIONS` | optional, e.g. `@owner1 @owner2`, mentioned in alert issues |
| Secret | `PCO_APP_ID`, `PCO_SECRET` | the Personal Access Token |
| Secret | `HC_PING_URL` | Healthchecks.io ping URL (strongly recommended) |
| Secret | `CLOUDFLARE_API_TOKEN` | only for Cloudflare ("Cloudflare Pages: Edit") |

## The sync

`scripts/sync.mjs` runs in four steps, and only the last one touches files:

1. **Fetch** both feeds independently through the chosen adapter (`scripts/adapters/`).
   - `pco`: `GET /registrations/v2/signups?filter=unarchived&where[categories]=<id>&include=…` with
     sparse fieldsets (capacity and address details are only returned when requested), version
     `2025-05-01`. Then `GET /groups/v2/groups?filter=group_type,published&group_type_id=<id>&include=enrollment,location`,
     version `2023-07-10`. Basic auth with the PAT, pagination, and retries with back-off on
     429/5xx (honouring `Retry-After`).
   - `churchcenter`: **undocumented, prototype only.** An anonymous 2-hour visitor token from
     `springoflifechurch.churchcenter.com/sessions/tokens`, then `api.churchcenter.com` read the
     way Church Center's own pages read it. It sees only listed signups and published groups.
     Planning Center can change or block it at any time.
2. **Normalize** (`scripts/lib/normalize.mjs`):
   - Keep only signups with the website category ID, and only groups of the Life Groups type.
     Groups must be explicitly listed.
   - Drop events whose every date has ended, and sort the rest soonest first.
   - Event descriptions are rebuilt from an allowlist (`scripts/lib/html.mjs`).
   - Phone numbers and emails are redacted, best effort: US, +7/+380 and RU/UA formats, numbers
     split across tags, `tel:`/`mailto:`/WhatsApp links, and links carrying a number.
   - Life Groups: see [Life Groups](#life-groups).
3. **Images** are downloaded into `src/assets/sync/` under content-hashed names (e.g.
   `signup-3894463-a014ac68ca5a.jpg`). The build turns them into responsive AVIF/WebP.
   - PCO's signup logo URL redirects to a signed URL that expires, so the site never hotlinks.
     `src/data/media-manifest.json` remembers each source, so unchanged images aren't
     downloaded again.
   - A broken image keeps the previous file, or the card shows no image.
   - A group whose photo is replaced in `group-overrides.yaml` isn't downloaded at all.
4. **Validate, guard, write.** Each feed is checked on its own.
   - A feed that fails (fetch, validation, or an empty list while the site still lists 3 or more
     current items) keeps its last good data, and the other feed is still published. The run
     then ends with `SYNC PARTIAL` and exit 1, so someone is alerted.
   - Files are written only when their content changed. One sync runs at a time (`.sync.lock`).

### Data files

`src/data/events.json`, soonest first:

| Field | Meaning |
|---|---|
| `id` | PCO signup ID (`"3894463"`) |
| `title`, `summary` | Plain text. `summary` is the opening sentence(s), at most 200 characters |
| `description_html` | Cleaned HTML (`p`, `h3`, `ul/ol/li`, `strong`, `em`, `a[href]`, `br`), safe to render |
| `starts_at`, `ends_at`, `all_day` | Next occurrence, UTC. `null` if the signup has no dates |
| `more_times` | Later occurrences `[{ starts_at, ends_at, all_day }]` (up to 11) |
| `location` | `{ name, address, city, postal: { street, locality, region, postal_code, country }, type }` or `null`. Online meeting links are never stored |
| `price` | `{ free, min_cents, max_cents, label }` (`"Free"`, `"$65"`, `"$350 – $450"`) or `null` |
| `image` | file name in `src/assets/sync/`, or `null` |
| `register_url`, `details_url` | Church Center registration form (`null` for announcements) and signup page |
| `registration` | `{ open, full, opens_at, closes_at }` |
| `updated_at`, `source` | From PCO, and `"pco"` or `"churchcenter"` |

`src/data/groups.json` has card fields only: `id`, `title`, `schedule`, `area`, `audience`,
`virtual`, `enrollment` (`{ status, strategy }`), `image`, `url` (Church Center), `updated_at`,
`source`. The validator and the build reject any other field. A bio or an address can't sneak in.

Also generated: `public/events.ics` (a subscribe-able calendar, deterministic) and
`out/weekly-digest.md` ("This week at Spring of Life Church", not committed). In GitHub the digest
is in each run's summary. It's also a download on Saturdays and manual runs. **It's a draft: a
person reviews it before it goes into the bulletin or Telegram.**

## Events

1. Create the signup in Planning Center Registrations as usual: name, description (the first
   sentence becomes the summary), date and time, location, and a 16:9 image (720×405 or larger).
2. Add the **website category** (signup settings → Categories). Only Registrations
   administrators can assign categories.
3. Within about 30 minutes the event appears:
   - on the Events page and the home page
   - on its own page, `/events/<title>-<id>/`, with the full description and Event structured
     data for Google
   - in the calendar feed, the weekly digest draft, the public feed `/feed/events.json`, and the
     SnapPages widget

To take it off the site, remove the category or archive the signup. When its last date has
passed it disappears by itself. A link to an ended or renamed event lands on the Events page or
the event's new address. Ongoing programs (AWANA, Russian School, Music Academy, Kids Choir)
should **not** get the category; they have permanent spots on the Ministries page.

"Register" shows while registration is open. Otherwise the card says "Full", "Registration opens
Sat, Oct 10" or "Registration closed".

**On the current SnapPages site:** see [docs/SNAPPAGES-EVENTS-EMBED.md](docs/SNAPPAGES-EVENTS-EMBED.md)
for the snippet, the SnapPages steps and the feed format.

## Updating ministry links once a year

`src/content/ministry-links.yaml` (Pages CMS: "Ministry links") holds every ongoing program. When
a new yearly signup is created, copy the number from its Church Center address and replace
`signup_id`:

```
https://springoflifechurch.churchcenter.com/registrations/events/3824843   →   signup_id: "3824843"
```

| Program | Signup | ID |
|---|---|---|
| AWANA | AWANA 2026-2027 | 3824843 |
| SOL Kids Choir | SOL Kids Choir 2026-2027 (link-only signup) | 3822440 |
| SOL Music Academy | SOL Music Academy 2026-2027 | 3645962 |
| SOL Russian School | SOL Russian School 2026-2027 | 3533274 |

Next Steps links (baptism 915918, SOL 101 2346933, and the People forms) live in
`src/content/next-steps.yaml`. The footer and Visit page take their form links from there too.

## Life Groups

The Life Groups page lists the published groups of type "English Life Groups" (ID 222818). Each
links to its Church Center page, where people request to join.

**The leaders' descriptions are bios with family details, so the website never shows or stores
them.** `scripts/lib/groups.mjs` reads only the first short lines of a description, and only these
patterns:

| Leader typed | Card shows |
|---|---|
| `Meeting Day - Tuesday` / `Meeting City - Everett` | Tuesdays · Everett |
| `Tue. 7PM - Mukilteo/Kirkland` | Tuesdays, 7:00 pm · Mukilteo and Kirkland |
| `Meeting City - Mukilteo (varies)` | Mukilteo (location varies) |
| `Young Family Group` (also Young Adults, Women's, Men's, Couples, Singles, Family, Adults) | "A young family group for Bible study, prayer and fellowship." |

Other rules:
- The PCO **schedule** field wins over a parsed day and time, as typed.
- A meeting place name appears only if the leader chose "exact" location visibility and it has
  no digits.
- No street address is ever shown.
- With no day: "Day and time on Church Center". With no area: no area line.
- PCO's generic default header image counts as no image.

`src/content/group-overrides.yaml` (Pages CMS: "Life Group exceptions") can hide or replace a
group's photo. Group 1570021 is hidden because its PCO header shows the old "Slavic Baptist
Church" sign. `docs/HANDOFF.md` has a short note for the leaders, asking them to fill in the
schedule and an approximate location.

## When something fails

| Message | Likely cause | Fix |
|---|---|---|
| `HTTP 401 …` | The PAT was revoked, or its owner was removed from PCO | Create a new PAT and update the `PCO_APP_ID`/`PCO_SECRET` secrets |
| `groups: HTTP 403 …` (with `SYNC PARTIAL`) | The PAT's owner has no Groups access. Events are still published | Give the token's owner Groups viewer access |
| `Planning Center returned 0 groups, but the site still lists 7 current groups` | Group type deleted or changed, or a PCO outage | Check PCO Groups. If it's real: Actions → Sync Planning Center → Run workflow → tick **allow empty** |
| `HTTP 500 after 4 attempts`, `Network error after 4 attempts` | PCO or network outage | Nothing; the next run retries |
| `image group-…: HTTP 404 (kept the previous image)` | PCO image temporarily missing | Next run retries. If it persists, re-upload the image in PCO |
| `Validation failed: …` | A signup or group is missing data the site needs | Fix the item named in the message |
| `SYNC_ADAPTER=churchcenter is a local prototype and is refused in GitHub Actions` | `SYNC_ADAPTER=churchcenter` without `ALLOW_PROTOTYPE_ADAPTER=1` | Use `pco`, or set the variable on purpose |
| `Another sync is running` | A previous local run crashed | Delete `.sync.lock` |
| Deploy: a red `npm test`, `check` or `check:dist` step | A content edit broke a page (e.g. a CMS field) | Read the message (it names the file), fix it in Pages CMS or git, push again |
| Deploy: red `deploy-github-pages` step | Pages not enabled, or a GitHub outage | Settings → Pages → Source = GitHub Actions, then Run workflow |

Run it yourself to see the full output: `npm run sync`. To undo a bad data commit:
`git revert <sha>`.

**Alerts.** A failed run opens one GitHub issue (label `site-alert`). Repeated failures add
comments, and the next green run closes it. Everyone watching the repository gets the emails.
Healthchecks.io additionally catches runs that never start. Use a 30-minute period with a 60-90
minute grace, because GitHub's cron is often 10-30 minutes late.

**The 60-day rule.** In a public repository GitHub disables scheduled workflows after 60 days
without any repository activity, for example a quiet summer with no Planning Center changes. A
weekly `keepalive` job in `sync.yml` re-enables both workflows through the API. GitHub also
emails the admins before disabling a schedule. If it happens anyway: Actions → Sync Planning
Center → **Enable workflow**.

## Switching from `churchcenter` to `pco`

1. Pick the PCO user who will own the token, ideally a dedicated "Website Sync" person tied to a
   church mailbox. They need **Registrations administrator** and **Groups viewer** access.
2. Sign in as that user at https://api.planningcenteronline.com/oauth/applications → Personal
   Access Tokens → New. Name it "SOL website read-only sync".
3. Put the Application ID and Secret in `.env` and run `SYNC_ADAPTER=pco npm run sync`. Compare
   `src/data/*.json` with the prototype output. The Groups request has not run live yet.
4. Add the secrets `PCO_APP_ID` and `PCO_SECRET`. Set `SYNC_ADAPTER=pco` (or delete it) and delete
   `ALLOW_PROTOTYPE_ADAPTER`.

## Hosting

The build is plain files in `dist/`, so any static host works. Every URL goes through
`SITE_URL`/`BASE_PATH`, so the same code serves a domain root or a sub-path.

| | GitHub Pages | Cloudflare Pages |
|---|---|---|
| Plan | Free for a **public** repository. A **private** repository needs a paid plan (Pro, Team, or Enterprise; GitHub for Nonprofits may give Team for free) | Free, including private repositories |
| Address | `https://<owner>.github.io/springoflife-website/` (project site), later the custom domain | `https://<project>.pages.dev`, later the custom domain (needs the domain's DNS on Cloudflare) |
| Old URLs | meta-refresh pages, and the 404 page forwards old sermon links | real 301s from `_redirects` |
| Headers | GitHub's own. `Access-Control-Allow-Origin: *` on every file, so the feed works | `public/_headers`: CORS on `/feed/*`, HSTS, frame denial, caching |
| Turn on | Settings → Pages → Source = **GitHub Actions** | Create the project, then set `DEPLOY_TARGET=cloudflare`, `CLOUDFLARE_PROJECT`, `CLOUDFLARE_ACCOUNT_ID` and the `CLOUDFLARE_API_TOKEN` secret. The workflow runs `wrangler pages deploy` |

A public repository is safe here. Secrets live in GitHub Secrets, `research/` is git-ignored, the
synced data holds no bios or addresses, and the test fixtures use synthetic bios. Rewrite the
history before making the repository public, because early commits contained the real bios.

## Going live

See `docs/HANDOFF.md` for the checklist. In short:

1. **Repository.** A church-owned GitHub organization with two owners is the long-term home.
   Branch protection on `main` must let the sync bot push (or don't protect `main`).
2. **Variables and secrets** as in [the table above](#github-repository-settings-settings--secrets-and-variables--actions).
   `PRODUCTION` stays unset during the preview.
3. **Preview.** Enable Pages (or Cloudflare), run **Build and deploy**, and check the preview
   address on a phone. It's noindex, so search engines ignore it.
4. **SnapPages events now.** Paste the widget snippet with the preview `HOST`
   (docs/SNAPPAGES-EVENTS-EMBED.md). Titles link to Church Center while the site is a preview.
5. **Launch.** Point the domain at the host (DNS is at Wix; change only the website records and
   leave Google Workspace MX/TXT alone):
   - GitHub Pages: `@` A records `185.199.108.153`, `.109.153`, `.110.153`, `.111.153`; `www`
     CNAME `<owner>.github.io`; Settings → Pages → custom domain `springoflifechurch.com`,
     **Enforce HTTPS**.
   - Then set `SITE_URL=https://springoflifechurch.com` and `PRODUCTION=true`, and run Build and
     deploy.
6. After launch: Subsplash app tabs and the Russian site's "EN" button → new URLs. Submit
   `sitemap-index.xml` in Search Console. Update the Google Business Profile link.

## Costs

| Item | Monthly |
|---|---|
| Hosting (GitHub Pages or Cloudflare Pages) and builds (Actions; unlimited for public repositories) | $0 |
| Pages CMS, Healthchecks.io, UptimeRobot (free tiers) | $0 |
| **New spend** | **≈ $0** |
| Unchanged: Planning Center (~$300+), Subsplash (quote-based; the website is bundled, so dropping SnapPages may not lower it, ask the CSM) | existing |

## Editing content

| What | File | In Pages CMS |
|---|---|---|
| Service time, address, phone, links, embeds | `src/content/site.yaml` | Site settings |
| Home page text and photo cards | `src/content/home.yaml` | Home page |
| Ministries and yearly signup IDs | `src/content/ministry-links.yaml` | Ministry links |
| Next steps (forms) | `src/content/next-steps.yaml` | Next steps |
| Life Group photo exceptions | `src/content/group-overrides.yaml` | Life Group exceptions |
| Leadership | `src/content/leaders.yaml` | Leadership |
| Statement of faith | `src/content/beliefs.yaml` | What we believe |
| Visit, About, Give text | `src/content/pages/*.md` | Pages |

Every YAML file is validated at build time. A typo fails the build with a message instead of
publishing a broken page. Text in `[square brackets]` is a placeholder waiting for real wording.

**Photos:** real church photos only, no stock and no AI-generated images. New photos go in
`src/assets/` (JPG, PNG or WebP; no HEIC) and are resized automatically. `src/assets/sync/`
belongs to the sync; don't edit it by hand. The logo mark (`src/assets/brand/mark.svg`) is an automatic
vector trace of the mark cropped from the church's own footer logo, without the old "Baptist
Church" wording. It's drawn inline (`src/components/BrandMark.astro`), so it stays sharp and forced
dark modes can't recolor it. Replace the file with the official vector logo when one exists (keep
one `<path>`).

## Privacy and security notes

- **No trackers or cookies on page load.** The sermon player and the giving form are
  click-to-load facades. `check:dist` fails if any page loads a third-party frame, script,
  stylesheet or image with its HTML.
- A Content-Security-Policy `<meta>` limits scripts to the site's own (hashed) code and frames to
  Subsplash. Structured data is escaped, so Planning Center text can't break out of it.
- Life Groups: card fields only (see above). Events: no online meeting links. Contact details
  are redacted, best effort.
- Workflows:
  - actions are pinned by commit SHA, and Dependabot updates them
  - every job has least-privilege permissions
  - dependencies install with `--ignore-scripts`
  - the push token exists only in the commit step

## Notes and decisions

- **Name:** "Spring of Life Church" everywhere. The sync also rewrites "Spring Of Life Church" and
  "Spring of Life Baptist Church" in PCO text. The doctrinal-statement link and association list
  from the old What We Believe page stay in `beliefs.yaml`, hidden (`show_affiliations: false`)
  until the pastors decide.
- **Church Center modal** (`js.churchcenter.com/modal/v1`) is not used. Event and group buttons
  open Church Center in a new tab.
- **Old URLs** (`src/lib/redirects.mjs`): `/i-m-new`, `/giving`, `/watch-live`, `/leadership`,
  `/what-we-believe`, `/contact`, `/media`, the form pages and a few more redirect to their new
  homes.
  - Old sermon pages `/media/<code>/<slug>` go to the same sermon on Subsplash. Any other
    `/media/*` URL goes to Watch.
  - Retired pages (`/mission-vision`, `/ukraine-support`, `/home-2`, the lorem-ipsum pages) are
    left to 404.
- **Structured data:** Organization and Church on the home page. One schema.org `Event` on each
  event's own page (Google's rule: one event per page, marked up on that page).

## Project layout

```
scripts/sync.mjs                    sync entry point (CLI + runSync())
scripts/adapters/pco.mjs            production adapter (PAT)
scripts/adapters/churchcenter.mjs   prototype adapter (undocumented API)
scripts/lib/                        http, html (sanitizer + redaction), groups (Life Group parser),
                                    normalize, media, ics, digest, output
scripts/check-dist.mjs              crawls the build (npm run check:dist)
scripts/test/                       node:test suites + fixtures (no network; synthetic bios)
src/data/                           synced JSON (written by the sync only)
src/assets/sync/                    synced images (written by the sync only)
src/content/                        editable YAML + Markdown
src/pages/                          Home, Visit, About, Ministries, Life Groups, Watch, Events,
                                    events/[slug] (one page per event), Next Steps, Give, 404,
                                    feed/events.json, robots.txt
src/components/, src/layouts/       UI (SermonEmbed and GiveEmbed are the click-to-load facades)
src/lib/                            content validation, time, events, groups, feed, JSON-LD, URLs
public/embed/sol-events.js          SnapPages events widget (minified at build)
public/_headers                     Cloudflare Pages headers
.github/workflows/                  sync.yml (every 30 min), deploy.yml (Pages/Cloudflare), both off by default
.pages.yml                          Pages CMS config
docs/HANDOFF.md                     go-live checklist
docs/SNAPPAGES-EVENTS-EMBED.md      the SnapPages events widget and the feed format
```
