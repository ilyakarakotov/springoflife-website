# Handoff checklist

The short version of what's left before this prototype becomes springoflifechurch.com. Details
are in the README.

## Planning Center
- [ ] Rename the category `"Website Category "` to something public-friendly (it shows as a filter on Church Center), e.g. "Upcoming Events". The ID 111199 stays, so nothing in the code changes.
- [ ] Decide who can tag events (only Registrations administrators can assign categories).
- [ ] Create a "Website Sync" PCO user on a church mailbox with Registrations administrator + Groups viewer access, then a Personal Access Token.
- [ ] Run `SYNC_ADAPTER=pco npm run sync` locally with the token and compare with the prototype output.
- [ ] Send the Life Group leaders the note below. Confirm the two groups with 0 members. Move serve teams and Tech Team out of public group types.
- [ ] Archive the finished signups that are still open (Kids Camp 3630218, YA Camp 3827516, day camps 3652930/3652969).

### Note for Life Group leaders (paste into the leaders' chat or email)
> **Life Group leaders: two quick fields in Planning Center, please.** The new church website builds each Life Group card automatically from Planning Center Groups. To make your card accurate:
> 1. Open your group in Planning Center Groups → **Settings** → **Schedule** and type your day and time, e.g. **Tuesdays at 7:00 pm**. The website shows this exactly as you type it.
> 2. Under **Location**, add where you meet and set the map to **Approximate**, so people see the area, not your address.
> 3. Optional: make the first line of your description your group type, e.g. **Young Family Group** or **Young Adults Group**.
>
> Your personal bio stays on your Church Center page only. The website never shows it.

## Content (placeholders marked `[...]` on the site)
- [ ] About: "Our story".
- [ ] Visit: kids check-in details, "When you arrive" (parking, entrance).
- [ ] Ministries: Kids Choir rehearsal time, Youth description and time, Young Adults, Missions, Sunday kids details.
- [ ] SOL Christian Academy grades (K–5, K–6 or K–8?).
- [ ] Give: can checks be mailed to 4711 116th St SW?
- [ ] Pastors: show the doctrinal statement link and affiliations on About? (`show_affiliations` in `beliefs.yaml`)
- [ ] A few more recent photos (services, kids without identifiable faces, groups) and an official logo file without "Baptist".

## GitHub and hosting (preview first)
- [ ] **Before the repository is made public:** rewrite the git history (squash). Early commits contained the Life Group leaders' real bios in `src/data/groups.json` and the test fixtures; the current files don't.
- [ ] GitHub Pages on a free plan needs a **public** repository (a private one needs a paid plan). Otherwise use Cloudflare Pages (README "Hosting").
- [ ] Repository variables:
  - `SITE_AUTOMATION_ENABLED=true`
  - `SITE_URL=https://<owner>.github.io/springoflife-website/`
  - `SYNC_ADAPTER=churchcenter` and `ALLOW_PROTOTYPE_ADAPTER=1` until the PAT exists, then `SYNC_ADAPTER=pco` and delete `ALLOW_PROTOTYPE_ADAPTER`
  - leave `PRODUCTION` unset (preview, noindex)
- [ ] Secrets: `PCO_APP_ID`, `PCO_SECRET` (when the PAT exists), `HC_PING_URL`.
- [ ] Settings → Pages → Source: **GitHub Actions**. Run **Build and deploy**, and check the preview on a phone.
- [ ] Make sure both owners **watch** the repository (Watch → All activity, or at least Issues). Failures arrive as a "site-alert" issue. Optionally set `ALERT_MENTIONS` to `@owner1 @owner2`.
- [ ] Healthchecks.io: one check for the sync, period 30 min, **grace 60-90 min** (GitHub's cron is often late). Put its ping URL in `HC_PING_URL`.
- [ ] UptimeRobot (optional): a keyword check on `<SITE_URL>feed/events.json` for `"version": 1`. It fails if the site or the feed is down. Don't use `data-events-count`, which is present even when there are 0 events.
- [ ] Branch protection on `main` (if any) must let the sync bot push.
- [ ] Invite editors in Pages CMS (app.pagescms.org) and test each form once.

## Events on the current SnapPages site (can happen now, before launch)
- [ ] Follow `docs/SNAPPAGES-EVENTS-EMBED.md`: Home page → delete the empty Subsplash "Upcoming Events" block → Add a block → Extras → Code → paste the snippet with the preview `HOST` → Save → Publish.
- [ ] Check the live SnapPages page in a private window. With nothing tagged it says "No upcoming public events right now" and links to Church Center.

## Domain (DNS is hosted at Wix)
- [ ] Find out which Wix account holds the springoflifechurch.com DNS zone (it also controls church email).
- [ ] Screenshot every existing DNS record first.
- [ ] `@` A → 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153 (remove 35.164.64.246).
- [ ] `www` CNAME → `<owner>.github.io` (remove www212.wixdns.net).
- [ ] Leave MX and TXT records untouched. Optionally add DMARC (`p=none`) and turn on DKIM in Google Workspace.
- [ ] GitHub Pages: custom domain, verify the domain, Enforce HTTPS.
- [ ] Then set `SITE_URL=https://springoflifechurch.com` and **`PRODUCTION=true`**, and run Build and deploy. Check that pages no longer carry `noindex`.

## After launch
- [ ] Subsplash app tabs that pointed at SnapPages pages → new URLs. Ask the Subsplash CSM whether dropping SnapPages changes the price (30+ days before renewal).
- [ ] Russian site "EN" button → new site.
- [ ] Search Console: submit `/sitemap-index.xml`; request removal of `/mission-vision` and `/ukraine-support`.
- [ ] Google Business Profile: website link.
- [ ] Weekly: copy the digest draft from the latest sync run, review it, then post.
