# Upcoming events on the current SnapPages site

This puts the church's upcoming events, live, on any page of the current springoflifechurch.com
(SnapPages), long before the new website replaces it. It shows the same events as the new site's
Events page: **only Planning Center Registrations signups tagged with the website category**
(ID 111199). AWANA, the leaders retreat, serve-team signups and other internal or ongoing items are
never tagged, so they never appear.

It's a small script (`public/embed/sol-events.js`, under 6 KB, no dependencies) that reads the new
site's public feed (`/feed/events.json`) each time someone opens the page.

## 1. The snippet

Replace `HOST` (two places) with the address where the new site is published, without a trailing
slash. See [Where the feed lives](#4-where-the-feed-lives) below.

```html
<div data-sol-events data-src="HOST/feed/events.json" data-limit="3">
  <noscript><a href="https://springoflifechurch.churchcenter.com/registrations">See upcoming events on Church Center</a></noscript>
</div>
<script src="HOST/embed/sol-events.js" defer></script>
```

Example for a GitHub Pages project site:

```html
<div data-sol-events data-src="https://springoflifechurch.github.io/springoflife-website/feed/events.json" data-limit="3">
  <noscript><a href="https://springoflifechurch.churchcenter.com/registrations">See upcoming events on Church Center</a></noscript>
</div>
<script src="https://springoflifechurch.github.io/springoflife-website/embed/sol-events.js" defer></script>
```

Before pasting, open `HOST/feed/events.json` in a browser. You should see `"version": 1` and the
current events.

## 2. Add it in SnapPages

1. Sign in to SnapPages (Subsplash Dashboard → Website), open **Pages** and pick the page, e.g. Home.
   Click **Edit**.
2. Delete the old "Upcoming Events" block. It is a Subsplash Events embed that shows "There are no
   upcoming events" (see `site-audit.md`).
3. Click **Add a block**, open **Extras** and drag the **Code** block to where the events should go.
   Code blocks accept HTML, CSS and JavaScript, including `<script>` tags.
4. Click into the code field and paste the snippet **with the keyboard** (Cmd+V on a Mac, Ctrl+V on
   Windows). SnapPages ignores right-click → Paste in this field.
5. **Save**, then **Publish**. The editor preview may not run scripts. Check the live page in a
   private window.

Optional: put a normal SnapPages heading ("Upcoming events") above the block. The widget has no
heading of its own, so the page's heading structure stays yours.

## 3. What visitors see

| Situation | What the widget shows |
|---|---|
| Events are tagged | Up to `data-limit` cards, soonest first. Each has a date badge, the title, day and time, place and city, Free or the price, extra chips ("Full", "Registration opens Sat, Oct 10", "+2 more dates"), and a **Register** button that opens Church Center in a new tab. When registration isn't open, the button is **Details**. Below the cards: "See all events". |
| **Nothing is tagged** | "No upcoming public events right now." with a link to all signups on Church Center. |
| The feed can't be reached, or takes more than 5 seconds | "Events couldn't be loaded right now." with a link to Church Center. |
| JavaScript is off | The `<noscript>` link to Church Center. |
| An event ended after the feed was published | It's hidden: each event carries `live_until`. |

The widget never shows an error in the browser console that affects the page, never changes
anything outside its own box, and isn't affected by the SnapPages theme. Its styles live in a
Shadow DOM, and only the theme's font family and size come through. It uses a light theme, works
from 320 px wide, and doesn't animate when the visitor asks for reduced motion.

**Links:** while the new site is a preview build (`PREVIEW=true`, see the README), event titles and
"See all events" go to Church Center, so SnapPages visitors aren't sent to an unlisted preview.
After launch they go to the event's page on the new site. `data-link` overrides this.

### Options (attributes on the `<div>`)

| Attribute | Default | Meaning |
|---|---|---|
| `data-src` | `feed/events.json` next to the script's folder | Feed URL |
| `data-limit` | `3` | Number of events, 1 to 12 |
| `data-heading-level` | `3` | Heading level of each event title (2 to 6). Use `2` if the block sits directly under the page title. |
| `data-link` | `churchcenter` for a preview feed, else `site` | Where titles and "See all events" go: `site` (the new website) or `churchcenter` |

Several widgets on one page are fine.

## 4. Where the feed lives

The feed and the script are built and deployed with the new site, so they update whenever the
sync publishes a change (about every 30 minutes when something changed). Browsers may cache the
feed for up to 10 minutes.

| Host | `HOST` value | CORS (needed so SnapPages can read the feed) |
|---|---|---|
| GitHub Pages (repo `springoflife-website`) | `https://<owner>.github.io/springoflife-website` | GitHub Pages sends `Access-Control-Allow-Origin: *` on every file. Nothing to do. |
| Cloudflare Pages | `https://<project>.pages.dev` | `public/_headers` sets `Access-Control-Allow-Origin: *` on `/feed/*`. |
| After launch | `https://springoflifechurch.com` | Same as the host above. By then SnapPages is retired, and the new site shows events itself. |

The README's "Going live" section has the hosting steps. The widget only needs the site to be
deployed somewhere public. The domain doesn't have to move first.

## 5. Feed format (`/feed/events.json`, version 1)

A stable contract for this widget and anything else that wants the church's public events. Fields
are never renamed or removed within version 1. New optional fields may appear. A breaking change
would bump `version`, and this widget shows its error state for versions it doesn't know.

```json
{
  "version": 1,
  "generated_at": "2026-10-02T07:53:56Z",
  "preview": false,
  "timezone": "America/Los_Angeles",
  "site": { "name": "Spring of Life Church", "url": "https://…/", "events_url": "https://…/events/",
            "signups_url": "https://springoflifechurch.churchcenter.com/registrations" },
  "events": [ { "id": "3894463", "title": "Intentional Parenting", "…": "…" } ]
}
```

| Event field | Example | Notes |
|---|---|---|
| `id` | `"3894463"` | Planning Center signup ID |
| `title`, `summary` | `"Intentional Parenting"`, `"Parenting is a gift, …"` | Plain text. `summary` is at most 200 characters, or `null` |
| `starts_at`, `ends_at` | `"2026-10-04T01:00:00Z"` | Next date, UTC. `null` when the signup has no date |
| `all_day` | `false` | |
| `timezone` | `"America/Los_Angeles"` | Labels are in this zone |
| `live_until` | `"2026-10-04T04:00:00Z"` | When the last date is over. Hide the event after this |
| `date_label`, `time_label` | `"Sat, Oct 3"`, `"6:00–9:00 pm"` | Ready to display. `time_label` is `"All day"` or `null` |
| `badge` | `{ "month": "OCT", "day": "3", "weekday": "SAT" }` | Or `null` |
| `more_dates` | `0` | How many later dates the event has |
| `location_name`, `city` | `"Spring of Life Church"`, `"Mukilteo"` | Never a street address |
| `price_label`, `free` | `"Free"` / `"$65"` / `"$350 – $450"`, `true` | `null` when there's no ticket |
| `image_url`, `image_width`, `image_height` | absolute URL, `720`, `405` | Or `null` |
| `register_url` | Church Center registration form | Only while registration is open, else `null` |
| `details_url` | `https://…/events/intentional-parenting-3894463/` | The event's page on the new site |
| `church_center_url` | `https://springoflifechurch.churchcenter.com/registrations/events/3894463` | |
| `full` | `false` | Sold out (no waitlist) |
| `registration` | `"open"` | `open`, `full`, `opens_soon`, `closed` or `none` (announcement only) |
| `status_label` | `null` | `"Full"`, `"Registration opens Sat, Oct 10"`, `"Registration closed"` or `null` |

All URLs are absolute. The feed has no descriptions, links from descriptions, street addresses,
contact details or Planning Center internals. `npm run check:dist` fails the build if an
undocumented field appears.

## 6. Troubleshooting

| Symptom | Check |
|---|---|
| Nothing at all where the block is | The live page, not the editor preview. Is the `<script>` line in the block, and does `HOST/embed/sol-events.js` open in a browser? |
| "Events couldn't be loaded" | Open `HOST/feed/events.json`. A 404 means the site isn't deployed at that address (check `HOST`). On a custom host, the response must include `Access-Control-Allow-Origin: *`. |
| "No upcoming public events" but an event exists | Is the signup tagged with the website category in Planning Center? Did the last "Sync Planning Center" run in GitHub Actions succeed? |
| Old events still show | They disappear at `live_until` even if the feed is stale. If a changed time doesn't show, check the latest sync run. |

## Testing

`npm test` checks the feed schema, privacy, register-URL rules and the widget's size budget. The
widget was also tested in headless Chrome at 320, 390 and 1440 px, inside a SnapPages-like page on
another origin with deliberately hostile CSS. Cases: 0, 1 and 3 events (plus one over the limit and
one already ended), HTTP 500, a non-CORS response, an unknown feed version, and a feed that never
answers (error state after 5 s). Each case passed with 0 axe violations, no page errors, no
horizontal scroll, and Tab reaching every link with a visible focus ring.
