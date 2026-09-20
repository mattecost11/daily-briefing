# Daily Briefing

A twice-weekly briefing installed as a PWA (Progressive Web App) on an iPhone 14 Pro.
Three dashboards — Cloud & Tech, Global Geopolitics, Investments — plus a Theory Library that unlocks 2 notions per day. All the source data is real: RSS feeds classified with keyword rules on the server, no AI.

> **Status:** milestone **M1 – PWA skeleton** is done. Content and the scheduled refresh land in later milestones.

## Milestones

| # | Milestone | Status |
|---|---|---|
| M1 | PWA skeleton | ✅ done |
| M2 | Theory batch 1 (days 1–30) | ☐ |
| M3 | Theory batch 2 (days 31–60) | ☐ |
| M4 | Theory batch 3 (days 61–90) | ☐ |
| M5 | Feed refresh script | ☐ |
| M6 | GitHub Actions schedule + keep-alive | ☐ |
| M7 | Web Push end-to-end | ☐ |
| M8 | Polish + README for the non-technical user | ☐ |

## Preview locally

```bash
npm run serve
```

Then open http://localhost:4173 in a browser.

## Deploy

GitHub Pages, source = `main` branch `/docs` folder. Detailed step-by-step
instructions land in the final README at M8.

## Layout

```
daily-briefing/
├── docs/                       # served by GitHub Pages
│   ├── index.html
│   ├── manifest.webmanifest
│   ├── service-worker.js
│   ├── css/styles.css
│   ├── js/{app.js, push.js}
│   ├── fonts/Carlito-*.woff2
│   ├── icons/*.png
│   └── data/{news.json, theory.json}
├── scripts/
│   ├── dev-server.mjs          # local preview
│   ├── generate-icons.py       # regenerate PNG icons
│   └── (M5+) refresh.mjs, generate-vapid.mjs
├── package.json
└── README.md
```
