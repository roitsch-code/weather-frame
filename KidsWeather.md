# Lio & Mika's Weather

A fullscreen landscape kids' weather picture-frame app. Two cartoon boys — Lio and Mika — dress according to the live weather near Ratingen/Düsseldorf. Built in pure HTML / CSS / JS, no frameworks, deployed on GitHub Pages.

**Live:** https://roitsch-code.github.io/weather-frame/

---

## What it does

| Feature | Detail |
|---|---|
| Live weather | Multi-provider with automatic fallback — refreshes every 15 min |
| Outdoor comfort | Uses a **play comfort model** (air temp + sun bonus − wind penalty − rain penalty) instead of shade apparent temperature |
| Sun bonus | Accounts for direct sun warming using solar radiation or cloud cover + seasonal factor |
| Smart outfit | Based on **average play comfort over the next 90 minutes** (not the 3-hour minimum) |
| Rain gear | Separate logic for visuals (imminent/current rain) vs. clothing (heavier threshold) |
| Outfit stability | Hysteresis: a new outfit must appear on 2 consecutive fetches (~30 min) before switching |
| Forecast strip | Up to 4 time-slot pills showing **play comfort** ranges (not shade apparent temp) |
| Animated scenes | Scene adapts to current conditions — not to the outfit |
| Time of day | Dawn / dusk sky tints based on real sunrise & sunset times; night sky from 18:30 |
| Sleepy mode | 18:30–06:00 — night sky, Pixar moon, twinkling stars, fireflies, pyjama outfits |
| Weekend mode | Saturday & Sunday mornings show a fun weekend outfit; tap the weather icon to override if leaving home before noon |
| PIN lock | 4-digit PIN protects the screen; stay unlocked for 30 days |
| Offline resilience | Last good weather is cached in `localStorage` under key `wf_weather_v2`; app still renders during API outages |

---

## Weather providers (in fallback order)

| Priority | Provider | Notes |
|---|---|---|
| 1 (primary) | **Bright Sky / DWD** | German weather service data, excellent for DE; provides solar radiation + sunshine minutes |
| 2 | **Open-Meteo** | Global, free, no API key; provides shortwave radiation from hourly data |
| 3 | **MET Norway** | Global, free; no radiation data (falls back to cloud-cover estimate for sun bonus) |
| 4 | **Cache** | Last successful response from `localStorage`; used when all providers fail |

Each provider has an 8-second timeout. The active provider is logged to the browser console.

---

## Outdoor play comfort model

The app no longer relies on the provider's "apparent temperature" (which is measured in the shade).
Instead it computes a **play comfort** value that better represents how kids feel when playing outdoors:

```
playComfort = airTemp + sunBonus − windPenalty − rainPenalty
```

### Sun bonus

```
sunBonus = liveSunBonus × seasonalFactor
```

- **liveSunBonus** — derived from shortwave radiation W/m² (if available from provider), otherwise estimated from cloud-cover fraction. Maximum: 8 °C at full sun.
- **seasonalFactor** — smooth cosine curve: 0.4 in winter (weaker sun angle) → 1.0 in summer. Driven by day-of-year, not a crude month rule.
- Sun bonus is 0 at night and when it is actively raining (> 0.3 mm/h).

### Wind penalty

Above 10 km/h: 0.25 °C per additional km/h. Example: 20 km/h → −2.5 °C.

### Rain penalty

Scales with precipitation up to a maximum of −4 °C.

### Short-term trend

The final outfit decision uses the **average play comfort over the current and next 1–2 hourly slots (~90 min)**, not the minimum over 3 hours. This avoids over-dressing on sunny mornings where the earliest slot is slightly cold.

---

## Outfit logic

Outfits are chosen in this priority order:

1. **Sleepy** — 18:30 to 06:00
2. **Weekend** — Sat/Sun mornings (06:00–12:00), unless overridden by tapping the weather icon
3. **Summer_Rainy** — rain clothing ✓ + play comfort > 20 °C
4. **Rainy** — rain clothing ✓ + play comfort > 3 °C
5. **Winter_Cold** — play comfort ≤ 3 °C **and** calendar is Dec–Mar or Nov 16+
6. **Spring_Fall_Cold** — play comfort ≤ 10 °C
7. **Spring_Fall_Mild** — play comfort ≤ 15 °C
8. **Spring_Fall_Warm** — play comfort ≤ 20 °C
9. **Summer_Warm** — play comfort ≤ 25 °C
10. **Summer_Hot** — play comfort > 25 °C

> Thresholds apply to **play comfort**, not shade apparent temperature.

### Rain clothing vs rain visuals

| Criterion | Visual rain scene | Rain clothing |
|---|---|---|
| Trigger threshold | Precip ≥ 0.1 mm/h **or** imminent in 30 min ≥ 0.2 mm | Precip ≥ 0.3 mm/h **or** 60-min total ≥ 1.0 mm with rainy WMO code |
| Purpose | Show rain visually (puddles, raindrops) | Kids should wear raincoat / rain gear |

### Outfit hysteresis

To avoid jitter, a new outfit must be recommended on **2 consecutive fetches (~30 min)** before the display switches. Exception: Sleepy transitions always happen immediately.

### Daily variants

Some outfits rotate daily so the kids look a bit different each day:

| Outfit | Lio variants | Mika variants |
|---|---|---|
| Sleepy | 4 | 5 |
| Spring_Fall_Mild | 3 | 2 |
| Spring_Fall_Warm | 4 | 4 |

---

## Scenes

The background scene is driven by **current weather conditions**, not by the outfit. Key change vs. v1: `scene-winter` now requires actual snowfall (WMO snow code), not just a cold winter outfit.

| Scene class | Visual | When |
|---|---|---|
| `scene-sunny` | Blue sky, spinning sun, butterfly, clouds | Clear sky, summer season |
| `scene-spring` | Pastel sky, cherry-blossom petals, clouds | Clear sky, spring or clear winter |
| `scene-fall` | Orange sky, falling leaves, bare tree | Autumn season |
| `scene-cloudy` | Grey-blue sky, full cloud cover | Overcast (WMO code ≥ 3) |
| `scene-rainy` | Dark sky, raindrops, puddles | Rain visual active |
| `scene-thunderstorm` | Very dark, heavy rain, lightning flash | Thunderstorm WMO code |
| `scene-foggy` | White-grey, drifting fog bands | Fog WMO code |
| `scene-windy` | Swept sky, wind-blown leaves | Wind > 30 km/h |
| `scene-winter` | Icy pale sky, snowflakes (only when snowing) | Snow WMO code present |
| `scene-weekend` | Purple gradient, confetti | Weekend morning outfit |
| `scene-sleepy` | Deep navy, stars, fireflies, Pixar moon | 18:30–06:00 |

Time-of-day classes (`time-dawn`, `time-dusk`, `time-night`) add warm/cool sky tints based on actual sunrise/sunset times.

---

## Temperature display

| Position | Value | Meaning |
|---|---|---|
| Large (primary) | **Play comfort** | What it actually feels like for kids playing outdoors |
| Small (secondary) | **Air temperature** + "echt" | True air temperature from the weather station |

---

## Image files

All images live in `/images/`. Filename convention: `{Character}_{Outfit}.png` or `{Character}_{Outfit}_{N}.png` for daily variants.

### Characters & outfits

| File | When shown |
|---|---|
| `Lio_Sleepy.png` / `_2` / `_3` / `_4` | 18:30–06:00 |
| `Mika_Sleepy.png` / `_2` / `_3` / `_4` / `_5` | 18:30–06:00 |
| `Lio_Weekend.png` / `Mika_Weekend.png` | Sat/Sun mornings |
| `Lio_Winter_Cold.png` / `Mika_Winter_Cold.png` | play comfort ≤ 3 °C, calendar winter |
| `Lio_Spring_Fall_Cold.png` / `Mika_Spring_Fall_Cold.png` | play comfort ≤ 10 °C |
| `Lio_Spring_Fall_Mild.png` / `_2` / `_4` | play comfort ≤ 15 °C |
| `Mika_Spring_Fall_Mild.png` | play comfort ≤ 15 °C |
| `Lio_Spring_Fall_Warm.png` / `_2` | play comfort ≤ 20 °C |
| `Mika_Spring_Fall_Warm.png` / `_2` | play comfort ≤ 20 °C |
| `Lio_Summer_Warm.png` / `Mika_Summer_Warm.png` | play comfort ≤ 25 °C |
| `Lio_Summer_Hot.png` / `Mika_Summer_Hot.png` | play comfort > 25 °C |
| `Lio_Rainy.png` / `Mika_Rainy.png` | Rain clothing, play comfort ≤ 20 °C |
| `Lio_Summer_Rainy.png` / `Mika_Summer_Rainy.png` | Rain clothing, play comfort > 20 °C |

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

## Season boundaries

| Season | Calendar range |
|---|---|
| Winter | 1 Dec – 31 Mar and 16 Nov – 30 Nov |
| Spring | 1 Apr – 31 May |
| Summer | 1 Jun – 31 Aug |
| Fall | 1 Sep – 15 Nov |

---

## Location

Default: `lat: 51.230383, lon: 6.809134` (Ratingen/Düsseldorf area).

### Travel override

For travel, uncomment and set `LOCATION_OVERRIDE` in `script.js`:

```js
const LOCATION_OVERRIDE = {
  label:   'City Name',
  lat:     51.84,
  lon:     6.25,
  startMs: new Date('2026-05-01T12:00:00+02:00').getTime(),
  endMs:   new Date('2026-05-03T20:00:00+02:00').getTime(),
};
```

Outside the start/end window the app automatically reverts to the default location. No manual change needed when you get back.

---

## Tunable constants

All in the **CONFIGURATION** section at the top of `script.js`:

| Constant | Default | What it controls |
|---|---|---|
| `SUN_BONUS_MAX_W` | 8 °C | Max bonus at full solar radiation |
| `SUN_BONUS_MAX_CLOUD` | 7 °C | Max bonus estimated from cloud-cover |
| `SEASONAL_FACTOR_MIN` | 0.4 | Winter sun multiplier (weakest) |
| `SEASONAL_FACTOR_MAX` | 1.0 | Summer sun multiplier (strongest) |
| `WIND_PENALTY_THRESHOLD_KMH` | 10 | Wind below this: no penalty |
| `WIND_PENALTY_RATE` | 0.25 | °C penalty per km/h above threshold |
| `RAIN_PENALTY_MAX` | 4 °C | Max cold penalty from active rain |
| `RAIN_VISUAL_MM_H` | 0.1 | mm/h to show rain scene |
| `RAIN_IMMINENT_MM` | 0.2 | mm in next 30 min to pre-show rain scene |
| `RAIN_CLOTHING_CURRENT_MM` | 0.3 | mm/h to trigger rain gear now |
| `RAIN_CLOTHING_1H_MM` | 1.0 | mm in 60 min to trigger rain gear (with rainy code) |

---

## PIN lock

- Default PIN: **change in `script.js`** → `const PIN_CODE = '1234';`
- Stays unlocked for **30 days** after a correct entry
- Tap the weather icon on a weekend morning to switch from Weekend outfit to the real weather outfit

---

## APIs

| Provider | URL | Auth |
|---|---|---|
| Bright Sky | https://api.brightsky.dev | None |
| Open-Meteo | https://api.open-meteo.com | None |
| MET Norway | https://api.met.no | None (User-Agent header required) |

---

## File structure

```
weather-frame/
  index.html        ← layout & PIN overlay
  style.css         ← scenes, animations, UI
  script.js         ← all logic (18 labelled sections)
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

---

## Tuning after real-world testing

Things you may want to adjust after watching the kids in various conditions:

- **`SUN_BONUS_MAX_W`** — reduce from 8 to 6 if the app still recommends too-light clothes on sunny mornings
- **`WIND_PENALTY_RATE`** — increase if windy days still feel too warm in the app
- **`RAIN_CLOTHING_1H_MM`** — reduce if rain gear is triggered too late, increase if too early
- The **90-minute** window in `getShortTermPlayComfort` — can be shortened to 60 min if the app reacts too slowly to worsening conditions
- **`SEASONAL_FACTOR_MIN`** — rarely matters in Düsseldorf winters (overcast dominates), but can be raised if winter sun feels stronger than the model thinks
