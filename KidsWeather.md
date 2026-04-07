# Lio & Mika's Weather

A fullscreen landscape kids' weather picture-frame app. Two cartoon boys — Lio and Mika — dress according to the live weather in Düsseldorf. Built in pure HTML / CSS / JS, no frameworks, deployed on GitHub Pages.

**Live:** https://roitsch-code.github.io/weather-frame/

---

## What it does

| Feature | Detail |
|---|---|
| Live weather | Open-Meteo API (free, no key required) — refreshes every 15 min |
| Smart outfit | Uses the **minimum felt temperature over the next 3 hours**, so kids dress for how cold it feels *now*, not just at noon |
| Rain gear | Triggered only when forecast totals **> 2 mm** in the next 3 hours — light drizzle is ignored |
| Forecast strip | Up to 4 time-slot pills (Morgens / Mittags / Nachmittag / Abends) below the temperature; slots disappear as the day progresses |
| Animated scenes | Background scene adapts to weather: sunny, spring, fall, cloudy, rainy, thunderstorm, foggy, windy, winter, weekend, sleepy |
| Time of day | Dawn / dusk sky tints based on real sunrise & sunset times; night sky from 18:30 |
| Sleepy mode | 18:30–06:00 — night sky, Pixar moon, twinkling stars, fireflies, pyjama outfits |
| Weekend mode | Saturday & Sunday mornings show a fun weekend outfit; tap the weather icon to override if leaving home before noon |
| PIN lock | 4-digit PIN protects the screen; stay unlocked for 30 days |
| Offline resilience | Last good weather is cached in `localStorage`; app still renders during API outages |

---

## Outfit logic

Outfits are chosen in this priority order:

1. **Sleepy** — 18:30 to 06:00
2. **Weekend** — Sat/Sun mornings (06:00–12:00), unless overridden by tapping the weather icon
3. **Summer_Rainy** — rain forecast + felt temp > 20 °C
4. **Rainy** — rain forecast + felt temp > 3 °C
5. **Winter_Cold** — felt temp ≤ 3 °C **and** calendar is Dec–Mar or Nov 16+
6. **Spring_Fall_Cold** — felt temp ≤ 10 °C (also used in spring/fall when ≤ 3 °C)
7. **Spring_Fall_Mild** — felt temp ≤ 15 °C
8. **Spring_Fall_Warm** — felt temp ≤ 20 °C
9. **Summer_Warm** — felt temp ≤ 25 °C
10. **Summer_Hot** — felt temp > 25 °C

> Winter_Cold is suppressed Apr 1 – Nov 15 even at freezing temperatures — no puffy winter coat in spring or early autumn.

### Daily variants

Some outfits rotate daily so the kids look a little different each day:

| Outfit | Lio variants | Mika variants |
|---|---|---|
| Sleepy | 4 | 5 |
| Spring_Fall_Mild | 3 | 1 |
| Spring_Fall_Warm | 2 | 2 |

---

## Image files

All images live in `/images/`. Filename convention: `{Character}_{Outfit}.png` or `{Character}_{Outfit}_{N}.png` for daily variants.

### Characters & outfits

| File | When shown |
|---|---|
| `Lio_Sleepy.png` / `_2` / `_3` / `_4` | 18:30–06:00 |
| `Mika_Sleepy.png` / `_2` / `_3` / `_4` / `_5` | 18:30–06:00 |
| `Lio_Weekend.png` / `Mika_Weekend.png` | Sat/Sun mornings |
| `Lio_Winter_Cold.png` / `Mika_Winter_Cold.png` | ≤ 3 °C, calendar winter |
| `Lio_Spring_Fall_Cold.png` / `Mika_Spring_Fall_Cold.png` | ≤ 10 °C |
| `Lio_Spring_Fall_Mild.png` / `_2` / `_4` | ≤ 15 °C |
| `Mika_Spring_Fall_Mild.png` | ≤ 15 °C |
| `Lio_Spring_Fall_Warm.png` / `_2` | ≤ 20 °C |
| `Mika_Spring_Fall_Warm.png` / `_2` | ≤ 20 °C |
| `Lio_Summer_Warm.png` / `Mika_Summer_Warm.png` | ≤ 25 °C |
| `Lio_Summer_Hot.png` / `Mika_Summer_Hot.png` | > 25 °C |
| `Lio_Rainy.png` / `Mika_Rainy.png` | Rain, ≤ 20 °C |
| `Lio_Summer_Rainy.png` / `Mika_Summer_Rainy.png` | Rain, > 20 °C |

### Weather icons (top-right)

| File | Condition |
|---|---|
| `Sunshine.png` | Clear sky |
| `Sunny with Clouds.png` | Partly cloudy |
| `Cloudy.png` | Overcast / foggy |
| `Rain.png` | Rain |
| `Thunderstorm.png` | Thunderstorm |
| `Snow.png` | Snow |
| `Windy.png` | High wind |
| `Rainbow.png` | Weekend mode |
| `Moon.png` | Sleepy mode |

---

## Scenes

The background scene is driven by weather code and outfit:

| Scene class | Visual | When |
|---|---|---|
| `scene-sunny` | Blue sky, spinning sun, butterfly, clouds | Summer outfits, clear |
| `scene-spring` | Pastel sky, cherry-blossom petals, clouds | Spring, mild & clear |
| `scene-fall` | Orange sky, falling leaves, bare tree | Autumn |
| `scene-cloudy` | Grey-blue sky, full cloud cover | Overcast |
| `scene-rainy` | Dark sky, raindrops, puddles | Rain |
| `scene-thunderstorm` | Very dark, heavy rain, lightning flash | Thunderstorm |
| `scene-foggy` | White-grey, drifting fog bands | Fog |
| `scene-windy` | Swept sky, wind-blown leaves | Wind > 30 km/h |
| `scene-winter` | Icy pale sky, snowflakes (only when actually snowing) | Winter cold |
| `scene-weekend` | Purple gradient, confetti | Weekend morning |
| `scene-sleepy` | Deep navy, stars, fireflies, Pixar moon | 18:30–06:00 |

Time-of-day classes (`time-dawn`, `time-dusk`, `time-night`) add warm/cool sky tints based on actual sunrise/sunset.

---

## Season boundaries

| Season | Calendar range |
|---|---|
| Winter | 1 Dec – 31 Mar and 16 Nov – 30 Nov |
| Spring | 1 Apr – 31 May |
| Summer | 1 Jun – 31 Aug |
| Fall | 1 Sep – 15 Nov |

---

## Location override

For travel, a temporary location can be set in `script.js`:

```js
const LOCATION_OVERRIDE = {
  label:   'City Name',
  lat:     51.84,
  lon:     6.25,
  startMs: new Date('2026-04-04T16:00:00+02:00').getTime(),
  endMs:   new Date('2026-04-06T20:00:00+02:00').getTime(),
};
```

Outside the start/end window the app automatically reverts to Düsseldorf. No manual change needed when you get back.

---

## PIN lock

- Default PIN: **change in `script.js`** → `const PIN_CODE = '1234';`
- Stays unlocked for **30 days** after a correct entry
- Tap the weather icon on a weekend morning to switch from Weekend outfit to the real weather outfit (useful when leaving home before noon)

---

## API

**Open-Meteo** — https://open-meteo.com
- Free for non-commercial use, no API key
- Up to 10,000 calls/day
- Data: current conditions + hourly forecast (apparent temperature, precipitation, weather code, wind speed)
- Location: Düsseldorf 51.22 °N, 6.78 °E

---

## File structure

```
weather-frame/
  index.html        ← layout & PIN overlay
  style.css         ← scenes, animations, UI
  script.js         ← all logic (weather, outfits, particles, PIN)
  KidsWeather.md    ← this file
  images/
    Lio_*.png
    Mika_*.png
    Sunshine.png
    Rain.png
    ...
```

---

## Deployment

Hosted on GitHub Pages from the `main` branch root.
Push to `main` → live within ~1 minute at https://roitsch-code.github.io/weather-frame/

```bash
git add images/NewOutfit.png
git commit -m "Add new outfit image"
git push
```
