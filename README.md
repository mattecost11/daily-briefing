# Daily Briefing

A twice-weekly briefing installed as a **Progressive Web App (PWA)** on an iPhone. Three dashboards — **Cloud & Tech**, **Global Geopolitics**, **Investments** — plus a **Theory Library** that unlocks 2 new notions per day for 90 days. The news is real (RSS feeds fetched by GitHub, classified with transparent keyword rules, and summarised by Google Gemini). The app works offline, updates on its own every Monday and Thursday at 07:00 London time, and pings the phone with a push notification each time.

**Live URL:** https://mattecost11.github.io/daily-briefing/

This README is written for someone who is **not** a developer. It shows you exactly what to click.

---

## What runs where

| Piece | Where it lives | When it runs |
|---|---|---|
| The app you see on the phone | GitHub Pages, served at the URL above | On every open |
| News refresh | GitHub Actions (a robot on GitHub's servers) | Monday & Thursday, **from** 07:00 Europe/London — usually lands in the late morning because GitHub starts scheduled jobs late (see Known limitations) |
| Push notification | Same GitHub Actions run | Right after each refresh |
| Keep-alive heartbeat | GitHub Actions | 1st of every month, 12:00 UTC |

Once installed on the iPhone, the person using it **never has to do anything**. It refreshes itself; it pings itself; if it's offline it shows the last-cached briefing with a "Last updated" stamp.

---

## Installing on a fresh iPhone (2 minutes)

Do this **on the iPhone itself**, using **Safari** (must be Safari, not Chrome or Firefox — the "Add to Home Screen" behaviour on iOS only works there).

1. Open Safari and go to https://mattecost11.github.io/daily-briefing/
2. Tap the **Share** icon (a square with an up-arrow, in the bottom bar).
3. Scroll down in the sheet and tap **Add to Home Screen**.
4. Give it a name (defaults to "Briefing") and tap **Add**.
5. Close Safari. Open the app from its new Home Screen icon (three-colour bookmark).
6. On the Welcome screen, tap **Enable notifications**.
7. iOS shows a permission popup — tap **Allow**.
8. A long block of text (JSON) appears with a **Copy** button. Tap **Copy**.
9. Get that text to your computer (email it to yourself, drop it in a Note that syncs to iCloud, iMessage, or use Universal Clipboard if the iPhone and Mac share iCloud).
10. On your Mac in a terminal, from inside the project folder:
    ```bash
    echo '<paste-the-json-here>' | gh secret set PUSH_SUBSCRIPTION
    ```
11. Trigger a test push:
    ```bash
    gh workflow run refresh.yml
    ```
12. Within 60–90 seconds the iPhone should get a **Daily Briefing — New briefing available** notification.

That's it. From now on the app pings itself Mondays and Thursdays at 07:00 without any further action.

**If the notification doesn't arrive**: open **Settings → Notifications** on the iPhone, find **Briefing**, and make sure **Allow Notifications** is ON with at least one alert style ticked.

---

## The three dashboards, explained

### Cloud & Tech (light blue)
- **New partnerships** — companies teaming up (matched on phrases like `partners with`, `strategic alliance`, `collaborates with`, `teams up with`)
- **Acquisitions** — mergers and buyouts (matched on `acquires`, `acquisition of`, `agreed to buy`, `merger of`, `bought by`)
- **Product launches** — new releases (matched on `launches`, `unveils`, `introduces`, `announces`, `general availability`, `now available`, `rolls out`, `opens preview`)

The exact phrases live in [scripts/rules.json](scripts/rules.json). Sources are curated feeds from AWS, Azure, Google Cloud, TechCrunch, The Verge, Ars Technica and The Register.

### Global Geopolitics (light green)
Top 5 stories, ranked by **how many major outlets** cover them within the last 72 hours. The app clusters similar headlines together (using word overlap) and picks the clusters with the highest number of distinct sources. Each card shows "Also covered by N more outlets" so you can see the strength of coverage at a glance. Sources: BBC World, Al Jazeera, The Guardian, Deutsche Welle, France 24, NPR.

### Investments (light pink)
- **5 news items** on markets and finance (filtered with financial keywords, excludes press-release boilerplate)
- **2 theory notions per day** — a 90-day progressive curriculum starting with `What is a stock?` and building up to Modern Portfolio Theory, factor investing, LTCM, VAPID, Wirecard, SVB, and ending on Buffett and Bogle.
- Educational-content disclaimer at the bottom.

### Theory Library (deeper pink)
Everything unlocked so far, in one searchable list with a level filter (Beginner / Intermediate / Advanced). Two new notions appear every day for 90 days from the moment the app is first opened. Includes a search box.

---

## Changing what the app fetches or how it classifies

Everything is in two files that you can open in any text editor.

### To add / remove a news source
Edit [scripts/feeds.json](scripts/feeds.json). Each feed is one line:
```json
{ "name": "Nice display name", "url": "https://example.com/feed.xml", "topics": ["cloud"] }
```
`topics` is any combination of `cloud`, `geo`, `invest`. Commit the change, push, and the next scheduled run picks it up automatically.

### To change the classification rules for Cloud & Tech
Edit [scripts/rules.json](scripts/rules.json). Each bucket (`partnerships`, `acquisitions`, `launches`) has an `any_of` list of regex patterns. Add or remove patterns freely — matching is case-insensitive against title + excerpt.

### To change the number of items per section
In [scripts/rules.json](scripts/rules.json), change `limits.max_items_per_section` (default is 5).

### To change the Geo clustering strictness or recency window
`geo.recency_hours` in the same file. Clustering thresholds live at the top of [scripts/refresh.mjs](scripts/refresh.mjs) (`0.3` for jaccard, `0.45` for containment) if you ever need to tune them.

### To change the AI summariser
Length: `TARGET_SENTENCES` and `TARGET_WORDS` near the top of [scripts/summarize.mjs](scripts/summarize.mjs).
Model: `GEMINI_MODEL` env var, defaults to `gemini-flash-lite-latest`. To use a bigger/nicer model, set `GEMINI_MODEL=gemini-flash-latest` in the workflow file. Larger models cost more (past the free tier) but produce sharper prose.

---

## Adding more theory notions (past day 90)

Edit [docs/data/theory.json](docs/data/theory.json). Each notion is an object:
```json
{
  "id": "d091-my-topic",
  "day": 91,
  "order": 1,
  "level": "advanced",
  "title": "What is …?",
  "description": "…",
  "example": "Real historical example with a year",
  "takeaway": "One-sentence lesson"
}
```
Keep exactly **2 notions per day** and unique `id` values. When you have added the new notions, commit + push and the app automatically starts unlocking them on the corresponding day.

The app currently shows "Nothing unlocked yet — come back tomorrow" on the Library after day 90 has been consumed. If the user has reached day 90 without new notions being added, they'll see this state until you push more.

---

## Secrets (what's stored where)

Three secrets live inside the GitHub repo's Actions settings. You can see them with `gh secret list`.

| Secret | What it is | How to rotate |
|---|---|---|
| `VAPID_PRIVATE_KEY` | Signs push messages | Run `npm run generate-vapid`, paste the new PUBLIC key into `docs/js/push.js`, set the new PRIVATE key: `gh secret set VAPID_PRIVATE_KEY`. Then ask the end user to tap Enable notifications again to regenerate `PUSH_SUBSCRIPTION`. |
| `PUSH_SUBSCRIPTION` | Which device(s) to notify. Either a **single** subscription JSON object OR a JSON **array** of objects for multi-device (up to N devices — no hard cap). | If a device uninstalls the PWA or notifications stop working, ask that user to tap Enable notifications again on the app (open `#setup` if already onboarded), copy the JSON, then update the secret. To add a device: get its subscription JSON and paste `[<old-sub>, <new-sub>]` into the secret. Per-device expiry is logged individually and never breaks the workflow. |
| `GEMINI_API_KEY` | API key for AI summaries | Free-tier key from https://aistudio.google.com/apikey — `gh secret set GEMINI_API_KEY`. If summaries stop appearing, this is usually the reason. |

The PUBLIC VAPID key is committed inside `docs/js/push.js` — that one is safe to see, it's designed to be public.

---

## Troubleshooting

**No notification arrived**
1. Was the workflow actually triggered? `gh run list --workflow=refresh.yml --limit 3`
2. Did it succeed? `gh run view <run-id>`
3. Look at the "Send push notification" step. If it says `statusCode=201`, Apple accepted it — check iPhone Notification settings (Settings → Notifications → Briefing → Allow Notifications ON).
4. If it says `Subscription expired`, the PUSH_SUBSCRIPTION secret is stale. Follow the recovery steps in the Secrets table above.

**News items are showing the short RSS excerpt instead of the long AI summary**
- Some sites block bots or paywall their content — for those, the app falls back to the RSS excerpt (never leaves the card empty).
- If NO items get AI summaries, `GEMINI_API_KEY` is probably wrong. Check `gh secret list` and the `[summarize]` lines in the workflow logs.

**A specific feed is broken**
Check the workflow log for `FAIL <feed-name>`. Common causes: URL changed, feed temporarily down, rate limited. Update the URL in [scripts/feeds.json](scripts/feeds.json).

**The app on the iPhone shows an old version even after I push a change**
The service worker caches shell files aggressively. To force a refresh: close the PWA (swipe up from bottom, swipe up on its card), reopen it, close again, reopen. On the second open the new service worker takes over.

**I need to re-run the workflow manually**
```bash
gh workflow run refresh.yml
gh run watch  # optional, follows the run in real time
```

---

## Known limitations

- **The refresh time is not exact.** GitHub's free scheduler starts cron jobs late, sometimes by 4–6 hours. The workflow fires several times on Mondays and Thursdays and the first run on or after 07:00 London does the refresh; later runs that day see it's done and stop. So the briefing always arrives on the right day, but usually mid-to-late morning rather than at 07:00 sharp. For an exact 07:00, an external timer service can trigger the workflow at the precise minute; that needs an extra account and a GitHub access token.
- **iOS Web Push has real quirks.** The app MUST be added to the Home Screen for notifications to work — this is an iOS rule, not a bug in the app. If the user ever uninstalls the icon, the push subscription dies and you have to redo the "tap Enable notifications, copy JSON" step.
- **Article-fetch coverage isn't 100%.** About 40% of AWS "What's New" pages and some sites with heavy anti-bot protection can't be fetched cleanly; those items fall back to the RSS excerpt.
- **Same-story clustering isn't perfect.** Two very differently-worded takes on the same event may end up in separate slots. The threshold is a trade-off between missing near-duplicates and merging unrelated stories.
- **No search on news items** — search is only on the Theory Library. If you want news search too, it's a small addition.
- **Single device only.** The push subscription is stored as one GitHub secret; supporting multiple iPhones would need a small key-value store instead. Fine for the one-user brief.
- **No content moderation of the AI summaries.** Gemini could occasionally emphasise the wrong angle or drop nuance. All source links are always shown so the user can read the original in one tap.

---

## Project layout

```
daily-briefing/
├── .github/workflows/
│   ├── refresh.yml         # cron Mon & Thu 07:00 London
│   └── keep-alive.yml      # monthly heartbeat
├── scripts/
│   ├── refresh.mjs         # fetch feeds → classify → cluster → write news.json
│   ├── summarize.mjs       # article fetch + Gemini summaries
│   ├── send-push.mjs       # sends the Web Push notification
│   ├── generate-vapid.mjs  # one-shot: generate a VAPID keypair
│   ├── generate-icons.mjs  # regenerate PNG app icons
│   ├── dev-server.mjs      # zero-dep local preview
│   ├── feeds.json          # RSS source list (edit freely)
│   └── rules.json          # classification rules (edit freely)
├── docs/                   # served by GitHub Pages
│   ├── index.html
│   ├── manifest.webmanifest
│   ├── service-worker.js
│   ├── css/styles.css
│   ├── js/{app.js, push.js}
│   ├── fonts/Carlito-*.woff2
│   ├── icons/*.png
│   └── data/{news.json, theory.json}
├── package.json
└── README.md               # this file
```

---

## Handy commands (all safe to re-run)

```bash
# Locally preview the app
npm run serve                 # opens http://localhost:4173

# Manually run the refresh + summariser + push (needs GEMINI_API_KEY in env locally)
npm run refresh
GEMINI_API_KEY=… npm run summarize
VAPID_PRIVATE_KEY=… PUSH_SUBSCRIPTION=… npm run push

# Trigger the whole refresh workflow on GitHub
gh workflow run refresh.yml

# Watch the latest run
gh run watch

# See what secrets are set
gh secret list

# Regenerate app icons after design tweaks
npm run generate-icons
```

---

## Credits

- **Font:** Carlito (SIL Open Font License), metric-compatible with Calibri.
- **AI summaries:** Google Gemini (free tier).
- **Feeds:** BBC, Al Jazeera, The Guardian, Deutsche Welle, France 24, NPR, TechCrunch, The Verge, Ars Technica, The Register, AWS Blogs, Microsoft Azure Blog, Google Cloud Blog, CNBC, MarketWatch, Yahoo Finance.
- **Hosting:** GitHub Pages (free, public repo).
- **Scheduling:** GitHub Actions (free minutes on public repo).
