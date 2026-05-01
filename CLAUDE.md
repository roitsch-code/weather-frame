# weather-frame — Claude Code Context

## What this is
Fullscreen landscape kids' weather picture-frame app for Lio & Mika. Pure HTML/CSS/JS, no frameworks.
Location: Ratingen/Düsseldorf (`lat: 51.230383, lon: 6.809134`).

## Deployment
**GitHub Pages — push to `main` = live within ~1 min.**
Live URL: https://roitsch-code.github.io/weather-frame/
No Vercel. No build step. No CI. Just push.

## Key files
- `index.html` — layout & PIN overlay
- `style.css` — scenes, animations, characters, UI
- `script.js` — all logic (weather fetch, outfit, scenes, PIN)
- `images/` — all character and weather icon PNGs
- `KidsWeather.md` — full feature & tuning documentation

## Characters
- **Lio** — left side, `#lio`, faces right naturally
- **Mika** — right side, `#mika`, faces left naturally
- Bike outfit: class `outfit-bike` on `<body>` — characters are centered side-by-side

## Development branch convention
Feature branches: `claude/<description>-<id>`
Merge into `main` when done — that's the deploy.

## Do not ask
- How it's deployed → GitHub Pages, push to main
- Where the live URL is → https://roitsch-code.github.io/weather-frame/
- Read `KidsWeather.md` for all feature/tuning details before asking questions
