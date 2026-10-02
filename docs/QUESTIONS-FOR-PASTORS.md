# Questions for the pastors and the team

Open questions behind the new English website, grouped by who can answer them. Each item says
what the site shows today. Nothing below is guessed on the site: where a fact is unconfirmed, the
page uses neutral wording or leaves it out until someone answers.

Tick an item when it's answered, and note the answer and the date. Then update the file named in
the item (most are editable in Pages CMS).

## Pastor Igor

### Leaders (About page, `src/content/leaders.yaml`)
- [ ] **Leader titles.** The site uses the English site's titles. The Russian site differs:
  - Andrey Shuvarikov: "Associate Pastor" (English) or "Music Ministry Pastor" (Russian)?
  - Viktor Avdeyev: "Elder" (English) or "Pastor, missionary in Pskov and Velikie Luki" (Russian)?
  - Viktor Glinkin: "Elder", or "Pastor and Elder"?
  - Is "Youth Leader" still Michael Sagun's role?
  - Should Viktor Moroz, Mikhail Avdeyev or Oleg Gidenko be listed?
- [ ] Please look over the About page once to confirm each photo shows the right person (photos were
  matched by file, not by face).

### Sundays and kids (Visit page, Home)
- [ ] **Kids at 12:00.** The site says only: "Kids are welcome in the service, and childcare and
  activities are available for all ages during the 12:00 pm service. When you arrive, ask a greeter
  and they'll show you where to go." What's offered by age (nursery? Sunday school for ages 4–11 in
  English?), where do parents check kids in (Planning Center Check-Ins or paper), and where do they
  pick them up?
- [ ] **Arrival.** The site says "Come about 30 minutes early and grab a coffee before the service.
  Our greeters will be glad to help you find your way." (from the church's Instagram). Is coffee
  served before the 12:00 service? Where should guests park at noon while the 10:00 service lets
  out, is there overflow parking, and which doors should first-time guests use?
- [ ] Should the English site mention the **Monroe branch** (Sundays 1:00 pm, 17922 149th St SE)? Is
  that service in Russian?
- [ ] Should it mention the **Sunday 6:00 pm** evening service and Bible study? Is it Russian only?

### Ministries (`src/content/ministry-links.yaml`)
- [ ] **Teens.** Published as "Teens meet for Bible study in small groups and time together as a
  whole group, led by Sergiy Titarchuk" with "Thursdays, 7:00 pm" (from the Russian site). Is
  Thursday 7:00 pm still teen night? In English, Russian or both, and for which grades?
- [ ] **Young adults.** Published as meeting "every Monday night", "Mondays, 7:00 pm" (Instagram
  "Youth every Monday @ 7pm"). Is that the young adults fellowship? Roughly what ages, and in
  which language?
- [ ] **Missions.** Published without naming countries: "We support pastors and missionaries
  overseas, help refugees, and send mission teams to Mexico." May the site name Russia (Pskov) and
  Italy, and say the Mexico trip is "each summer"?
- [ ] **Russian School.** Is the Monday 6:30 pm school for children, a Russian-as-a-second-language
  class for teens and adults, or both? The site says "Russian-language classes … including a
  Russian-as-a-second-language class for teens and adults".
- [ ] **Life Groups.** Every card without a group type says "Bible study, prayer and fellowship."
  (the bulletin's words for Life Groups). OK?

### About and giving
- [ ] **Our story** is now on the About page, translated from the Russian site's history page. Is it
  right as written? When did the English service start, and would you like a sentence about it?
- [ ] **Mission wording:** "through the Word of God in worship and fellowship" (website, used now) or
  "through Word, Worship and Fellowship" (bulletin, Facebook)?
- [ ] Should the site show the Statement of Faith link (Baptist Faith and Message 2000) and the
  affiliations? They're hidden now because of the naming decision (`show_affiliations` in
  `src/content/beliefs.yaml`).
- [ ] **Checks.** The site says "Bring a check to any service, or drop it in the church mailbox at
  4711 116th St SW, Mukilteo." Can people also mail checks there, and who should they be made out to?
  May the Give page show the legal name, EIN and a tax-deductible line?

### People and promises
- [ ] **Prayer requests:** who reads them? The site now says only "Tell us how we can pray for you."
- [ ] **Connect cards:** does someone follow up? The site promises nothing ("Tell us a little about
  yourself").
- [ ] **Facebook:** which page is official for the English ministry, facebook.com/sproflifechurch
  (linked now) or facebook.com/solmukilteo? One or both?
- [ ] **Photo consent:** do we have parents' consent for the kids choir and orchestra photos, and is
  there a church photo-release policy? Both photos stay off the site until then.

## SOL Christian Academy (Liliya Gidenko / office)
- [ ] For 2026–27, which grades are enrolled? The application lists K4–K5 and "K6–Grade 8", the Aug
  2026 flyer says Pre-K–8, the Russian site says K–6, and the old English card said K–5 under a "K-8"
  title. The site states no grades for now ("Grades, tuition and enrollment: see the school's website").
- [ ] Which name should the church site use: "SOL Christian Academy" (used now) or "Spring of Life
  Christian Academy (SOLCA)"? Is the one-line description OK ("A private Christian school at Spring
  of Life, offering an education grounded in academic excellence and biblical truth")?
- [ ] Which public contact, if any: office@solk12.com or (425) 345-0303 (flyer), or Admin@solk12.com
  or (425) 493-1602 (application)?
- [ ] The 2026–27 application header reads "4711 116th **Pl** SW Mukilteo, WA **985275**"; it should be
  "116th St SW … 98275".
- [ ] May the church site say "Member of Enlightium School System Agency", as the school's site does?

## Nick (media)
- [ ] **The Sunday-arrival photo (AM4A0032).** It's the header image of the Ivan and Sveta Ryakhovskiy
  Life Group in Planning Center. The site uses it, cropped below the old "Slavic Baptist Church" sign
  line, on the Visit page and the Home "Plan a visit" card. Who shot it, may the website use it, and
  are there more from that shoot (lobby, coffee, greeters)? If the answer is no, replace
  `src/assets/photos/arrival.jpg` with another real photo (never one showing the old sign).
- [ ] Who shot the other AM4A photos on the Russian homepage (Christmas program)? May we use them?
- [ ] **Baptism photo.** The "Get Baptized" signup photo looked like stock, so it was taken off the
  site. If it's ours, it can come back (it's in the git history as `src/assets/photos/baptism.jpg`).
  The same question applies to the old site's Next Steps and Giving photos.
- [ ] **Photos the site still needs** (no identifiable children without written consent):
  greeters at the doors in daylight, families walking in, kids and AWANA (hands, crafts, backs, wide
  shots), a Life Group in a living room, the congregation from the stage during a song, the lobby
  after the service. Today the "Kids and teens" card uses a congregation photo and "Serve with us"
  a crop of the worship team.
- [ ] Can we get the original files of the leader studio shoot (larger than 1280×720)? Could Sergiy
  Titarchuk, Viktor Avdeyev and Viktor Glinkin be reshot to match the others?
- [ ] "All sermons" links to `subsplash.com/springoflifechurch/media` (the `/u/…` address shows
  "Page not found"). Is that the link you want? Were the Aug 23 and Aug 30 sermons left off Subsplash
  on purpose?
- [ ] Subsplash lists the speaker as "Mikhail Sagun"; the Leadership page says "Michael Sagun". Which?
- [ ] **AWANA logo.** The old AWANA image was clip-art with an old tagline, so the card has no image.
  Is there a real AWANA-night photo (no identifiable kids), or permission to use the current Awana
  Clubs logo?

## Alex (Russian site)
- [ ] Please align the Academy grades once the school confirms.
- [ ] Please remove or repoint the "ПОЖЕРТВОВАТЬ" banner that links to the English site's 404 page
  `/ukraine-support`, and clean up the old Give URL parameter.
- [ ] "На неделе": kids choir is Fridays 5:30–7:00 pm on Church Center (the page says 17:00), and
  Sunday school shows 10:00 there but "9:35 и 12:00" on the children's page. Which is right?
- [ ] Are the Monroe 1:00 pm and Sunday 6:00 pm services current?
- [ ] Which Facebook page is official (/solmukilteo or /sproflifechurch)?
- [ ] Pastors page: please confirm current titles so both sites match (Shuvarikov, Avdeyev, Glinkin).
- [ ] Privacy: the Russian site publishes personal phone numbers (pastors, ministry leaders) and
  members' birthdays in the bulletins. Should these move behind a login?
- [ ] The footer reads "© Spring of Life Baptist Church". Should it follow the naming decision?

## Ilya
- [ ] **Official logo file.** The mark in the header and footer is an automatic vector trace of the
  98-pixel mark cropped from the old footer logo. Please get the church's original vector logo (SVG,
  AI or PDF) without the "Baptist Church" wording, and replace `src/assets/brand/mark.svg`.
- [ ] **The dark-mode hero report.** To close it out: which browser and version, how dark mode was
  turned on (System Settings, DevTools, a browser flag or an extension), the URL, and a screenshot
  with DevTools → Network filtered to "worship". The hero is now hardened against both likely causes
  (a photo that hasn't loaded yet or failed, and forced-dark browsers).
- [ ] Ivan and Sveta's Life Group card uses a monogram because their Planning Center header photo
  shows the old sign. Ask them whether they'd like to upload a different header photo.
- [ ] Send the Life Group leaders the note in `docs/HANDOFF.md` (schedule and approximate location in
  Planning Center), so every card shows a day and time.
