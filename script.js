/* ═══════════════════════════════════════════════════════════════
   Lio & Mika's Weather — script.js
   Multi-provider weather · Outdoor play comfort model · v2
   ═══════════════════════════════════════════════════════════════ */


// ══════════════════════════════════════════════════════════════════
// 1. CONFIGURATION  — edit these to tune the app's behaviour
// ══════════════════════════════════════════════════════════════════

// ─── PIN ──────────────────────────────────────────────────────────
const PIN_CODE = '1234'; // ← change to your 4-digit PIN
const PIN_DAYS = 30;     // days before asking again

// ─── Location ─────────────────────────────────────────────────────
const LOCATION = { lat: 51.230383, lon: 6.809134 };

// Temporary away location — set startMs/endMs to override automatically.
// Remove or comment out when not travelling.
// const LOCATION_OVERRIDE = {
//   label:   'City Name',
//   lat:     51.84,
//   lon:     6.25,
//   startMs: new Date('2026-05-01T12:00:00+02:00').getTime(),
//   endMs:   new Date('2026-05-03T20:00:00+02:00').getTime(),
// };

function getActiveLocation() {
  if (typeof LOCATION_OVERRIDE !== 'undefined') {
    const now = Date.now();
    if (now >= LOCATION_OVERRIDE.startMs && now < LOCATION_OVERRIDE.endMs) {
      return { lat: LOCATION_OVERRIDE.lat, lon: LOCATION_OVERRIDE.lon };
    }
  }
  return LOCATION;
}

// ─── Timing ───────────────────────────────────────────────────────
const REFRESH_MS          = 15 * 60 * 1000; // weather fetch interval (ms)
const PROVIDER_TIMEOUT_MS = 12000;           // per-provider fetch timeout (ms)

// ─── Comfort model thresholds (tunable) ───────────────────────────
// Sun bonus
const SUN_BONUS_MAX_W     = 8;   // °C max bonus from full solar radiation (W/m²)
const SUN_BONUS_MAX_CLOUD = 7;   // °C max bonus estimated from clear-sky fraction
const SEASONAL_FACTOR_MIN = 0.4; // winter: solar effect is weaker
const SEASONAL_FACTOR_MAX = 1.0; // summer: solar effect is strongest

// Wind penalty
const WIND_PENALTY_THRESHOLD_KMH = 10;   // km/h — no penalty below this
const WIND_PENALTY_RATE          = 0.25; // °C penalty per km/h above threshold

// Rain penalty
const RAIN_PENALTY_MAX = 4; // °C max cold penalty from active rain

// ─── Rain logic thresholds (tunable) ──────────────────────────────
const RAIN_VISUAL_MM_H         = 0.1; // show rain scene if current precip ≥ this (mm/h)
const RAIN_IMMINENT_MM         = 0.2; // show rain scene if next-30-min forecast ≥ this (mm)
const RAIN_CLOTHING_CURRENT_MM = 0.3; // rain gear if current precip ≥ this (mm/h)
const RAIN_CLOTHING_1H_MM      = 1.0; // rain gear if 60-min total ≥ this + rainy WMO code


// ══════════════════════════════════════════════════════════════════
// 2. LOOKUP TABLES
// ══════════════════════════════════════════════════════════════════

const DAYS_DE = [
  'Sonntag', 'Montag', 'Dienstag', 'Mittwoch',
  'Donnerstag', 'Freitag', 'Samstag',
];

// WMO weather code sets
// Rainy: drizzle, rain, showers (NOT thunderstorm, fog, or snow)
const RAINY_CODES   = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82]);
const THUNDER_CODES = new Set([95, 96, 99]);
const FOG_CODES     = new Set([45, 48]);
const SNOW_CODES    = new Set([71, 73, 75, 77, 85, 86]); // actual snowfall only

// Particle colours
const CONFETTI_COLORS = [
  '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff',
  '#ff922b', '#f78fb3', '#a29bfe', '#74b9ff',
];
const LEAF_COLORS = [
  '#e67e22', '#c0392b', '#f39c12',
  '#d35400', '#8B0000', '#DAA520', '#b7451a',
];
const PETAL_COLORS = [
  '#ffcce0', '#ffb3cc', '#ff91b8', '#ffe0ec',
  '#ffffff', '#ffd6e7', '#ffadd2',
];

// Pixar-style weather icon → emoji mapping
const EMOJI_MAP = {
  sunny:         { img: 'Sunshine.png',          text: '🌞' },
  partly_cloudy: { img: 'Sunny with Clouds.png', text: '⛅' },
  cloudy:        { img: 'Cloudy.png',            text: '☁️' },
  rainy:         { img: 'Rain.png',              text: '🌧️' },
  thunderstorm:  { img: 'Thunderstorm.png',      text: '⛈️' },
  winter:        { img: 'Snow.png',              text: '⛄' },
  windy:         { img: 'Windy.png',             text: '💨' },
  foggy:         { img: 'Cloudy.png',            text: '🌫️' },
  weekend:       { img: 'Rainbow.png',           text: '🥳' },
  sleepy:        { img: 'Moon.png',              text: '🌙' },
};


// ══════════════════════════════════════════════════════════════════
// 3. PROVIDER WMO MAPS  — convert provider-specific codes to WMO ints
// ══════════════════════════════════════════════════════════════════

// Bright Sky uses string icon values: https://brightsky.dev/docs/#tag/Weather
const BRIGHTSKY_ICON_TO_WMO = {
  'clear-day':           0,
  'clear-night':         0,
  'partly-cloudy-day':   2,
  'partly-cloudy-night': 2,
  'cloudy':              3,
  'fog':                 45,
  'wind':                3,
  'drizzle':             51,
  'rain':                61,
  'sleet':               67,
  'snow':                71,
  'hail':                63,
  'thunderstorm':        95,
};

// MET Norway uses symbol_code strings; map by prefix/keyword
// Full list: https://api.met.no/weatherapi/weathericon/2.0/
function metnoSymbolToWMO(symbolCode) {
  if (!symbolCode) return 0;
  const s = symbolCode.toLowerCase();
  if (s.includes('thunder'))           return 95; // takes priority
  if (s.startsWith('heavysnow'))       return 75;
  if (s.startsWith('snow'))            return 73;
  if (s.startsWith('lightsnow'))       return 71;
  if (s.startsWith('sleet'))           return 67;
  if (s.startsWith('heavyrain'))       return 65;
  if (s.startsWith('rainshower'))      return 80;
  if (s.startsWith('rain'))            return 61;
  if (s.startsWith('lightrain'))       return 51;
  if (s.startsWith('fog'))             return 45;
  if (s.startsWith('cloudy'))          return 3;
  if (s.startsWith('partlycloudy'))    return 2;
  if (s.startsWith('fair'))            return 1;
  if (s.startsWith('clearsky'))        return 0;
  return 0;
}


// ══════════════════════════════════════════════════════════════════
// 4. PROVIDER: BRIGHT SKY (primary — DWD data, excellent for Germany)
//    https://brightsky.dev/docs/
// ══════════════════════════════════════════════════════════════════

async function fetchBrightSky(lat, lon) {
  const today    = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  // Bright Sky has no sunrise/sunset endpoint — fetch that from Open-Meteo daily
  // in parallel with the main weather call. If it fails, sunrise/sunset stays null
  // and the global cache carry-forward handles it.
  const sunUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=sunrise,sunset&forecast_days=1&timezone=Europe%2FBerlin`;

  const [wxRes, sunJson] = await Promise.all([
    fetch(`https://api.brightsky.dev/weather?lat=${lat}&lon=${lon}&date=${today}&last_date=${tomorrow}T06:00:00`),
    fetch(sunUrl).then(r => r.ok ? r.json() : null).catch(() => null),
  ]);
  if (!wxRes.ok) throw new Error(`BrightSky weather HTTP ${wxRes.status}`);

  const wxData  = await wxRes.json();

  const entries = wxData.weather ?? [];
  if (!entries.length) throw new Error('BrightSky: empty weather array');

  const sunrise = sunJson?.daily?.sunrise?.[0] ?? null;
  const sunset  = sunJson?.daily?.sunset?.[0]  ?? null;

  // Find the entry closest to now (recent observation or nearest forecast slot)
  const nowMs = Date.now();
  let current = entries[0];
  let bestDiff = Infinity;
  for (const e of entries) {
    const diff = Math.abs(new Date(e.timestamp).getTime() - nowMs);
    if (diff < bestDiff) { bestDiff = diff; current = e; }
  }

  // Derive is_day from sunrise/sunset times, falling back to icon string
  let isDay;
  if (sunrise && sunset) {
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const srMin  = isoToMinutes(sunrise);
    const ssMin  = isoToMinutes(sunset);
    isDay = (srMin !== null && ssMin !== null) ? (nowMin >= srMin && nowMin <= ssMin) : true;
  } else {
    const icon = current.icon ?? '';
    isDay = icon.includes('day') || (!icon.includes('night'));
  }

  // Bright Sky solar is in kWh/m²/h; × 1000 gives W/m² average for that hour.
  // solar_60 is the 1-hour accumulated value; solar is the slot value.
  const rawSolar = current.solar_60 ?? current.solar ?? null;
  const radiation = rawSolar !== null ? rawSolar * 1000 : null;

  // Build normalised hourly arrays (up to 24 h ahead)
  const cap    = nowMs + 24 * 3600000;
  const hourly = _emptyHourly();
  for (const e of entries) {
    if (new Date(e.timestamp).getTime() > cap) continue;
    hourly.time.push(e.timestamp);
    hourly.temperature_2m.push(e.temperature ?? null);
    hourly.apparent_temperature.push(e.apparent_temperature ?? e.temperature ?? null);
    hourly.precipitation.push(e.precipitation ?? 0);
    hourly.weathercode.push(BRIGHTSKY_ICON_TO_WMO[e.icon] ?? 0);
    hourly.windspeed_10m.push(e.wind_speed ?? 0);          // Bright Sky: already km/h
    hourly.cloudcover.push(e.cloud_cover ?? 50);
    const slotSolar = e.solar ?? null;
    hourly.shortwave_radiation.push(slotSolar !== null ? slotSolar * 1000 : null);
  }

  return {
    temp:          current.temperature,
    apparent:      current.apparent_temperature ?? null,
    code:          BRIGHTSKY_ICON_TO_WMO[current.icon] ?? 0,
    wind:          current.wind_speed ?? 0,                 // km/h
    cloudCover:    current.cloud_cover ?? 50,
    precipitation: current.precipitation ?? 0,
    isDay,
    radiation,
    sunshine:      current.sunshine_60 ?? current.sunshine ?? null, // minutes
    sunrise,
    sunset,
    hourly,
    provider:  'Bright Sky',
    fetchedAt: Date.now(),
  };
}


// ══════════════════════════════════════════════════════════════════
// 5. PROVIDER: OPEN-METEO (fallback 1 — global, no API key)
//    https://open-meteo.com/en/docs
// ══════════════════════════════════════════════════════════════════

async function fetchOpenMeteo(lat, lon) {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,precipitation,` +
    `weather_code,wind_speed_10m,cloud_cover,is_day` +
    `&hourly=temperature_2m,apparent_temperature,precipitation,` +
    `weather_code,wind_speed_10m,cloud_cover,shortwave_radiation` +
    `&daily=sunrise,sunset` +
    `&forecast_days=1` +
    `&timezone=Europe%2FBerlin`;

  const res  = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const data = await res.json();
  const c    = data.current;

  // Handle both old and new field names
  const code  = c.weather_code   ?? c.weathercode  ?? 0;
  const wind  = c.wind_speed_10m ?? c.windspeed_10m ?? 0;
  const cloud = c.cloud_cover    ?? c.cloudcover    ?? 50;
  const sunrise = data.daily?.sunrise?.[0] ?? null;
  const sunset  = data.daily?.sunset?.[0]  ?? null;

  // Normalise hourly field names
  const h = data.hourly ?? {};
  h.weathercode         = h.weather_code   ?? h.weathercode   ?? [];
  h.windspeed_10m       = h.wind_speed_10m ?? h.windspeed_10m ?? [];
  h.cloudcover          = h.cloud_cover    ?? h.cloudcover    ?? [];
  h.shortwave_radiation = h.shortwave_radiation ?? [];

  // Open-Meteo does not expose shortwave_radiation as a current field.
  // Derive it from the hourly slot that matches the current hour.
  const nowHourISO = new Date().toISOString().slice(0, 13); // "2026-04-07T10"
  let radiation = null;
  if (h.time) {
    const idx = h.time.findIndex(t => t.startsWith(nowHourISO));
    if (idx >= 0) radiation = h.shortwave_radiation[idx] ?? null;
  }

  const hourly = _emptyHourly();
  const cap    = Date.now() + 24 * 3600000;
  if (h.time) {
    for (let i = 0; i < h.time.length; i++) {
      if (new Date(h.time[i]).getTime() > cap) continue;
      hourly.time.push(h.time[i]);
      hourly.temperature_2m.push(h.temperature_2m?.[i]      ?? null);
      hourly.apparent_temperature.push(h.apparent_temperature?.[i] ?? null);
      hourly.precipitation.push(h.precipitation?.[i]        ?? 0);
      hourly.weathercode.push(h.weathercode[i]              ?? 0);
      hourly.windspeed_10m.push(h.windspeed_10m[i]          ?? 0);
      hourly.cloudcover.push(h.cloudcover[i]                ?? 50);
      hourly.shortwave_radiation.push(h.shortwave_radiation[i] ?? null);
    }
  }

  return {
    temp:          c.temperature_2m,
    apparent:      c.apparent_temperature ?? null,
    code,
    wind,
    cloudCover:    cloud,
    precipitation: c.precipitation ?? 0,
    isDay:         !!(c.is_day),
    radiation,
    sunshine:      null,
    sunrise,
    sunset,
    hourly,
    provider:  'Open-Meteo',
    fetchedAt: Date.now(),
  };
}


// ══════════════════════════════════════════════════════════════════
// 6. PROVIDER: MET NORWAY (fallback 2)
//    https://api.met.no/weatherapi/locationforecast/2.0/
//    A User-Agent header is required by MET Norway's terms of service.
// ══════════════════════════════════════════════════════════════════

async function fetchMETNorway(lat, lon) {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact` +
              `?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'KidsWeatherApp/2.0 (https://roitsch-code.github.io/weather-frame/)',
    },
  });
  if (!res.ok) throw new Error(`MET Norway HTTP ${res.status}`);
  const data = await res.json();

  const series = data?.properties?.timeseries ?? [];
  if (!series.length) throw new Error('MET Norway: empty timeseries');

  // Find the entry closest to now
  const nowMs = Date.now();
  let current = series[0];
  let bestDiff = Infinity;
  for (const s of series) {
    const diff = Math.abs(new Date(s.time).getTime() - nowMs);
    if (diff < bestDiff) { bestDiff = diff; current = s; }
  }

  const details = current.data?.instant?.details ?? {};
  const next1h  = current.data?.next_1_hours     ?? {};
  const symCode = next1h?.summary?.symbol_code   ?? '';
  const code    = metnoSymbolToWMO(symCode);
  const isDay   = symCode.includes('_day') || symCode.includes('polartwilight');

  const hourly = _emptyHourly();
  const cap    = nowMs + 24 * 3600000;
  for (const s of series) {
    if (new Date(s.time).getTime() > cap) continue;
    const d  = s.data?.instant?.details ?? {};
    const n1 = s.data?.next_1_hours     ?? {};
    const sc = n1?.summary?.symbol_code ?? '';
    hourly.time.push(s.time);
    hourly.temperature_2m.push(d.air_temperature ?? null);
    hourly.apparent_temperature.push(d.air_temperature ?? null); // no apparent from MET Norway
    hourly.precipitation.push(n1?.details?.precipitation_amount ?? 0);
    hourly.weathercode.push(metnoSymbolToWMO(sc));
    hourly.windspeed_10m.push((d.wind_speed ?? 0) * 3.6); // m/s → km/h
    hourly.cloudcover.push(d.cloud_area_fraction ?? 50);
    hourly.shortwave_radiation.push(null);                  // not in MET Norway compact
  }

  return {
    temp:          details.air_temperature ?? 10,
    apparent:      null,
    code,
    wind:          (details.wind_speed ?? 0) * 3.6, // m/s → km/h
    cloudCover:    details.cloud_area_fraction ?? 50,
    precipitation: next1h?.details?.precipitation_amount ?? 0,
    isDay,
    radiation:     null,
    sunshine:      null,
    sunrise:       null, // carry-forward from global cache
    sunset:        null,
    hourly,
    provider:  'MET Norway',
    fetchedAt: Date.now(),
  };
}


// ══════════════════════════════════════════════════════════════════
// 7. PROVIDER ORCHESTRATION  — timeout, fallback chain, cache
// ══════════════════════════════════════════════════════════════════

// Global sunrise/sunset — updated by any successful provider, reused by providers that lack it
let _sunriseISO = null;
let _sunsetISO  = null;

const WX_CACHE_KEY = 'wf_weather_v2';

function saveWeatherCache(wx) {
  try { localStorage.setItem(WX_CACHE_KEY, JSON.stringify(wx)); } catch (_) {}
}
function loadWeatherCache() {
  try {
    const v = JSON.parse(localStorage.getItem(WX_CACHE_KEY) || 'null');
    if (v && typeof v.temp === 'number' && v.hourly) return v; // basic shape check
  } catch (_) {}
  return null;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error('timeout')), ms)
    ),
  ]);
}

// Returns an empty hourly object (all arrays empty)
function _emptyHourly() {
  return {
    time: [], temperature_2m: [], apparent_temperature: [],
    precipitation: [], weathercode: [], windspeed_10m: [],
    cloudcover: [], shortwave_radiation: [],
  };
}

async function fetchWithFallback(lat, lon) {
  const providers = [
    { name: 'Bright Sky', fn: () => fetchBrightSky(lat, lon)  },
    { name: 'Open-Meteo', fn: () => fetchOpenMeteo(lat, lon)  },
    { name: 'MET Norway', fn: () => fetchMETNorway(lat, lon)  },
  ];

  for (const p of providers) {
    try {
      const wx = await withTimeout(p.fn(), PROVIDER_TIMEOUT_MS);
      // Carry forward cached sunrise/sunset if this provider didn't supply it
      if (!wx.sunrise && _sunriseISO) wx.sunrise = _sunriseISO;
      if (!wx.sunset  && _sunsetISO)  wx.sunset  = _sunsetISO;
      // Update global cache
      if (wx.sunrise) _sunriseISO = wx.sunrise;
      if (wx.sunset)  _sunsetISO  = wx.sunset;
      console.log(`[Weather] using ${wx.provider}`);
      saveWeatherCache(wx);
      return wx;
    } catch (err) {
      console.warn(`[Weather] ${p.name} failed: ${err.message}`);
    }
  }

  // All providers failed — return last known good cache
  const cached = loadWeatherCache();
  if (cached) {
    if (cached.sunrise && !_sunriseISO) _sunriseISO = cached.sunrise;
    if (cached.sunset  && !_sunsetISO)  _sunsetISO  = cached.sunset;
    const age = Math.round((Date.now() - (cached.fetchedAt ?? 0)) / 60000);
    console.warn(`[Weather] all providers failed — using cached data (${age} min old)`);
    return { ...cached, provider: 'cache' };
  }

  throw new Error('All weather providers failed and no cache available');
}


// ══════════════════════════════════════════════════════════════════
// 8. SOLAR & SEASON  — sun bonus with live data + seasonal calibration
// ══════════════════════════════════════════════════════════════════

function getDayOfYear(date) {
  return Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
}

/**
 * Returns a temperature bonus (°C) representing how much warmer kids feel
 * when playing outdoors in direct or partial sun vs. the shade air temperature.
 *
 * Formula:  sunBonus = liveSunBonus × seasonalFactor
 *
 * liveSunBonus — from shortwave radiation W/m² if available,
 *               otherwise estimated from cloud-cover fraction.
 *
 * seasonalFactor — smooth cosine: SEASONAL_FACTOR_MIN (winter solstice)
 *                  → SEASONAL_FACTOR_MAX (summer solstice).
 *                  Same radiation feels warmer in summer: higher sun angle,
 *                  longer exposure, warmer surroundings.
 */
function calcSunBonus(weather, now) {
  if (!weather.isDay) return 0;
  if ((weather.precipitation ?? 0) > 0.3) return 0; // active rain cancels sun bonus

  // Seasonal factor peaks at summer solstice ~day 172 (June 21)
  const doy      = getDayOfYear(now);
  const seasonal = SEASONAL_FACTOR_MIN +
    (SEASONAL_FACTOR_MAX - SEASONAL_FACTOR_MIN) *
    (1 + Math.cos(2 * Math.PI * (doy - 172) / 365)) / 2;

  // Live bonus: radiation data takes priority over cloud-cover estimate
  let live;
  if (weather.radiation !== null && weather.radiation !== undefined && weather.radiation >= 0) {
    // 0–900 W/m² → 0–SUN_BONUS_MAX_W (900 W/m² ≈ peak summer irradiance)
    live = Math.min(weather.radiation / 900, 1) * SUN_BONUS_MAX_W;
  } else {
    // Estimate from sky clearness: 0% cloud → full bonus, 100% cloud → 0
    live = (1 - (weather.cloudCover ?? 50) / 100) * SUN_BONUS_MAX_CLOUD;
  }

  // Light drizzle with thin cloud partially reduces the bonus
  if ((weather.precipitation ?? 0) > 0.1) live *= 0.3;

  return live * seasonal;
}


// ══════════════════════════════════════════════════════════════════
// 9. OUTDOOR COMFORT  — what it actually feels like for kids outside
// ══════════════════════════════════════════════════════════════════

/**
 * playComfort = airTemp + sunBonus − windPenalty − rainPenalty
 *
 * This replaces the old "minimum apparent temperature over 3 hours" approach.
 * Provider apparent temperature is measured in shade; playComfort models
 * real outdoor conditions including direct sun and activity.
 */
function calcPlayComfort(weather, sunBonus) {
  const windPenalty = Math.max(
    0,
    ((weather.wind ?? 0) - WIND_PENALTY_THRESHOLD_KMH) * WIND_PENALTY_RATE
  );
  const precip      = weather.precipitation ?? 0;
  const rainPenalty = precip > 0.1 ? Math.min(precip * 2, RAIN_PENALTY_MAX) : 0;
  return (weather.temp ?? 10) + sunBonus - windPenalty - rainPenalty;
}

/**
 * Average play comfort over the next ~90 minutes.
 * Replaces the old 3-hour minimum — less pessimistic, more representative
 * of how kids will feel during a play session starting now.
 */
function getShortTermPlayComfort(weather, now) {
  const h = weather.hourly;
  if (!h?.time?.length) {
    return calcPlayComfort(weather, calcSunBonus(weather, now));
  }

  const nowMs = now.getTime();
  const cap   = nowMs + 90 * 60 * 1000;
  let sum = 0, count = 0;

  for (let i = 0; i < h.time.length; i++) {
    const tMs = new Date(h.time[i]).getTime();
    if (tMs < nowMs - 30 * 60 * 1000) continue; // skip slots >30 min in the past
    if (tMs > cap) break;

    const slotWx = {
      temp:          h.temperature_2m[i]      ?? weather.temp,
      wind:          h.windspeed_10m[i]        ?? weather.wind,
      precipitation: h.precipitation[i]        ?? 0,
      cloudCover:    h.cloudcover[i]            ?? weather.cloudCover,
      radiation:     h.shortwave_radiation[i]   ?? null,
      isDay:         weather.isDay,              // approximate for near-future slots
    };
    const bonus = calcSunBonus(slotWx, new Date(h.time[i]));
    sum += calcPlayComfort(slotWx, bonus);
    count++;
  }

  if (count === 0) return calcPlayComfort(weather, calcSunBonus(weather, now));
  return sum / count;
}


// ══════════════════════════════════════════════════════════════════
// 10. RAIN LOGIC  — visual rain and clothing rain are separate decisions
// ══════════════════════════════════════════════════════════════════

/**
 * Should we show a rainy visual scene?
 * Triggers on: current rainy/thunder WMO code, measurable current precipitation,
 * or rain imminent within 30 minutes.
 */
function isRainVisual(weather, now) {
  if (RAINY_CODES.has(weather.code) || THUNDER_CODES.has(weather.code)) return true;
  if ((weather.precipitation ?? 0) >= RAIN_VISUAL_MM_H) return true;

  const h = weather.hourly;
  if (!h?.time) return false;
  const nowMs = now.getTime();
  const cap   = nowMs + 30 * 60 * 1000;
  for (let i = 0; i < h.time.length; i++) {
    const tMs = new Date(h.time[i]).getTime();
    if (tMs > nowMs && tMs <= cap && (h.precipitation[i] ?? 0) >= RAIN_IMMINENT_MM) return true;
  }
  return false;
}

/**
 * Should the kids wear rain gear?
 * More conservative than visual rain — needs heavier current or near-term precip.
 */
function isRainClothing(weather, now) {
  if ((weather.precipitation ?? 0) >= RAIN_CLOTHING_CURRENT_MM) return true;

  const h = weather.hourly;
  if (!h?.time) return false;
  const nowMs = now.getTime();
  const cap   = nowMs + 60 * 60 * 1000;
  let total = 0, hasRainyCode = false;
  for (let i = 0; i < h.time.length; i++) {
    const tMs = new Date(h.time[i]).getTime();
    if (tMs >= nowMs && tMs <= cap) {
      total += h.precipitation[i] ?? 0;
      const wc = h.weathercode[i];
      if (RAINY_CODES.has(wc) || THUNDER_CODES.has(wc)) hasRainyCode = true;
    }
  }
  return hasRainyCode && total >= RAIN_CLOTHING_1H_MM;
}


// ══════════════════════════════════════════════════════════════════
// 11. SEASON & TIME HELPERS
// ══════════════════════════════════════════════════════════════════

// Winter: Dec–Mar 31 | Spring: Apr–May | Summer: Jun–Aug | Fall: Sep–Nov 15
// Nov 16+ = winter again
function getCurrentSeason() {
  const m = new Date().getMonth(); // 0-based
  const d = new Date().getDate();
  if (m === 11 || m <= 2)                      return 'winter'; // Dec, Jan, Feb, Mar
  if (m === 3  || m === 4)                     return 'spring'; // Apr, May
  if (m >= 5   && m <= 7)                      return 'summer'; // Jun–Aug
  if (m === 8  || m === 9)                     return 'fall';   // Sep, Oct
  if (m === 10) return d <= 15 ? 'fall' : 'winter';             // Nov 1–15 fall, 16+ winter
  return 'winter';
}

// Parse "2026-04-01T06:42" → minutes since midnight
function isoToMinutes(isoStr) {
  if (!isoStr) return null;
  const t = isoStr.split('T')[1];
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

// Returns 'dawn' | 'day' | 'dusk' | 'night'
// 'night' = pre-dawn (before 06:00) or after 18:30 (Sleepy time)
function getTimeOfDay(now, sunriseISO, sunsetISO) {
  const h      = now.getHours();
  const nowMin = h * 60 + now.getMinutes();
  if (h < 6)              return 'night'; // before kids wake up
  if (nowMin >= 18*60+30) return 'night'; // 18:30+ — Sleepy mode
  const srMin = isoToMinutes(sunriseISO);
  const ssMin = isoToMinutes(sunsetISO);
  if (srMin !== null && nowMin < srMin + 55) return 'dawn';
  if (ssMin !== null && nowMin > ssMin - 70) return 'dusk';
  return 'day';
}


// ══════════════════════════════════════════════════════════════════
// 12. VISUAL STATE  — what the scene looks like outside RIGHT NOW
//     Decoupled from outfit: scene reflects current conditions,
//     not what the kids happen to be wearing.
// ══════════════════════════════════════════════════════════════════

/**
 * Returns the scene CSS class based on current weather reality.
 *
 * Special cases that still tie to outfit/time:
 *  - 'night' timeOfDay  → scene-sleepy (also covers post-18:30)
 *  - Weekend outfit     → scene-weekend (festive morning override)
 *
 * All other scenes are condition-driven, not clothing-driven.
 * In particular: scene-winter requires actual snowfall (WMO snow code),
 * not merely the Winter_Cold outfit.
 */
function getVisualScene(weather, outfit, timeOfDay, rainVisual) {
  if (timeOfDay === 'night')            return 'scene-sleepy';
  if (outfit === 'Weekend')             return 'scene-weekend';
  if (FOG_CODES.has(weather.code))      return 'scene-foggy';
  if (THUNDER_CODES.has(weather.code))  return 'scene-thunderstorm';
  if (rainVisual)                       return 'scene-rainy';
  if (SNOW_CODES.has(weather.code))     return 'scene-winter'; // actual snowfall, not just cold
  if ((weather.wind ?? 0) > 30)         return 'scene-windy';
  if (weather.code >= 3)               return 'scene-cloudy'; // overcast (WMO ≥ 3)
  // Clear or mostly clear — choose by season
  const s = getCurrentSeason();
  if (s === 'summer') return 'scene-sunny';
  if (s === 'fall')   return 'scene-fall';
  return 'scene-spring'; // spring or clear winter day
}

// Which weather icon / emoji to show top-right
function resolveEmojiKey(weather, outfit, rainVisual) {
  if (outfit === 'Sleepy')              return 'sleepy';
  if (outfit === 'Weekend')             return 'weekend';
  if (FOG_CODES.has(weather.code))      return 'foggy';
  if (THUNDER_CODES.has(weather.code))  return 'thunderstorm';
  if (rainVisual)                       return 'rainy';
  if (SNOW_CODES.has(weather.code))     return 'winter';
  if ((weather.wind ?? 0) > 30)         return 'windy';
  if (weather.code === 0)               return 'sunny';
  if (weather.code <= 2)                return 'partly_cloudy';
  return 'cloudy';
}

// ─── Body class manager ───────────────────────────────────────────
function applyBodyClasses() {
  const next = `${_currentScene} time-${_currentTimeOfDay}`;
  if (document.body.className !== next) document.body.className = next;
}

// ─── Pixar-style emoji renderer ───────────────────────────────────
function setWeatherEmoji(key) {
  const entry = EMOJI_MAP[key] || EMOJI_MAP.sunny;
  const $e    = document.getElementById('weather-emoji');
  const img   = new Image();
  img.onload  = () => {
    $e.innerHTML = '';
    const el = document.createElement('img');
    el.src   = `images/${entry.img}`;
    el.alt   = entry.text;
    el.style.cssText = 'height:1em; width:auto; vertical-align:middle;';
    $e.appendChild(el);
  };
  img.onerror = () => { $e.textContent = entry.text; };
  img.src = `images/${entry.img}`;
}

// ─── Cloud density ────────────────────────────────────────────────
// Shows 0–4 clouds proportional to cloud-cover %.
function adjustClouds(cloudCover, scene) {
  if (scene === 'scene-rainy' || scene === 'scene-thunderstorm' || scene === 'scene-cloudy') {
    cloudCover = 100; // precipitation/heavy scenes always fully clouded
  }
  if (scene === 'scene-sleepy' || scene === 'scene-winter' || scene === 'scene-foggy') return;
  const thresholds = [5, 32, 58, 78];
  document.querySelectorAll('.cloud').forEach((cloud, i) => {
    cloud.style.transition = 'opacity 2.5s ease';
    cloud.style.opacity    = cloudCover >= thresholds[i] ? '1' : '0';
  });
}


// ══════════════════════════════════════════════════════════════════
// 13. OUTFIT DECISION  — what the kids should wear
// ══════════════════════════════════════════════════════════════════

// ─── Hysteresis state ─────────────────────────────────────────────
// Prevents outfit from flipping on every 15-min refresh.
// A new outfit must appear on 2 consecutive fetches (~30 min) before it commits,
// EXCEPT for Sleepy which always transitions immediately.
let _stableOutfit    = null;
let _candidateOutfit = null;
let _candidateCount  = 0;

function applyHysteresis(newOutfit) {
  // Sleepy transitions are always immediate (bedtime / wake-up must not lag)
  if (newOutfit === 'Sleepy' || _stableOutfit === 'Sleepy') {
    _stableOutfit = newOutfit; _candidateOutfit = null; _candidateCount = 0;
    return newOutfit;
  }
  if (newOutfit === _stableOutfit) {
    _candidateOutfit = null; _candidateCount = 0;
    return newOutfit;
  }
  if (newOutfit === _candidateOutfit) {
    if (++_candidateCount >= 2) {
      // Confirmed across 2 consecutive fetches — commit the change
      _stableOutfit = newOutfit; _candidateOutfit = null; _candidateCount = 0;
    }
  } else {
    _candidateOutfit = newOutfit; _candidateCount = 1;
  }
  // Return current stable outfit until the candidate is confirmed.
  // On the very first call (_stableOutfit === null) accept immediately.
  return _stableOutfit ?? newOutfit;
}

/**
 * Determine outfit based on:
 *  - playComfort  (outdoor play comfort temperature — replaces raw apparent temp)
 *  - rainClothing (boolean — clothing-specific rain detection)
 *  - code         (WMO — used to include thunder in rain gear decision)
 *  - now          (Date — for time-based and calendar checks)
 */
function determineOutfit(playComfort, rainClothing, code, now) {
  const day    = now.getDay();
  const hour   = now.getHours();
  const minute = now.getMinutes();
  const m      = now.getMonth();
  const d      = now.getDate();

  const isSleepy         = (hour > 18 || (hour === 18 && minute >= 30)) || hour < 6;
  const isWeekendMorning = (day === 0 || day === 6) && hour >= 6 && hour < 12;
  const isCalendarWinter = m === 11 || m <= 2 || (m === 10 && d > 15); // Dec–Mar + Nov 16+
  const effectiveRain    = rainClothing || THUNDER_CODES.has(code);

  if (isSleepy)                             return 'Sleepy';
  if (isWeekendMorning && !weekendOverride) return 'Weekend';
  if (effectiveRain && playComfort > 20)    return 'Summer_Rainy';
  if (effectiveRain && playComfort > 3)     return 'Rainy';
  if (playComfort <= 3  && isCalendarWinter) return 'Winter_Cold';
  if (playComfort <= 10)                    return 'Spring_Fall_Cold';
  if (playComfort <= 15)                    return 'Spring_Fall_Mild';
  if (playComfort <= 20)                    return 'Spring_Fall_Warm';
  if (playComfort <= 25)                    return 'Summer_Warm';
  return 'Summer_Hot';
}


// ══════════════════════════════════════════════════════════════════
// 14. DAILY OUTFIT VARIANTS  — rotate so kids look a bit different each day
// ══════════════════════════════════════════════════════════════════

// null = no suffix (original image); '_2' = _2 variant, etc.
const OUTFIT_VARIANTS = {
  'Sleepy':           { lio: [null, '_2', '_3', '_4'],  mika: [null, '_2', '_3', '_4', '_5'] },
  'Spring_Fall_Mild': { lio: [null, '_2', '_4'],        mika: [null] },
  'Spring_Fall_Warm': { lio: [null, '_2'],              mika: [null, '_2'] },
};

function getDailyVariantSuffix(outfit, character) {
  const entry = OUTFIT_VARIANTS[outfit];
  if (!entry) return '';
  const list = entry[character];
  if (!list || list.length <= 1) return '';
  const now = new Date();
  const idx = (now.getFullYear() * 366 + now.getMonth() * 31 + now.getDate()) % list.length;
  return list[idx] ?? '';
}


// ══════════════════════════════════════════════════════════════════
// 15. FORECAST STRIP  — hourly pills below the temperature display
// ══════════════════════════════════════════════════════════════════

const FORECAST_SLOTS = [
  { label: 'Morgens',    startH: 6,  endH: 11 },
  { label: 'Mittags',    startH: 11, endH: 14 },
  { label: 'Nachmittag', startH: 14, endH: 17 },
  { label: 'Abends',     startH: 17, endH: 19 },
];

function buildForecastSlots(weather, now) {
  const h = weather?.hourly;
  if (!h?.time?.length) return null;
  const curH = now.getHours();

  return FORECAST_SLOTS.map(slot => {
    if (slot.endH <= curH) return null; // slot fully passed

    const indices = [];
    for (let i = 0; i < h.time.length; i++) {
      const slotH = new Date(h.time[i]).getHours();
      if (slotH >= slot.startH && slotH < slot.endH) indices.push(i);
    }
    if (!indices.length) return null;

    // Compute play comfort for each hourly index in this slot
    const comforts = indices.map(i => {
      const slotWx = {
        temp:          h.temperature_2m[i]      ?? 10,
        wind:          h.windspeed_10m[i]        ?? 0,
        precipitation: h.precipitation[i]        ?? 0,
        cloudCover:    h.cloudcover[i]            ?? 50,
        radiation:     h.shortwave_radiation[i]   ?? null,
        isDay:         weather.isDay,
      };
      const bonus = calcSunBonus(slotWx, new Date(h.time[i]));
      return calcPlayComfort(slotWx, bonus);
    }).filter(v => isFinite(v));

    if (!comforts.length) return null;

    const minTemp = Math.round(Math.min(...comforts));
    const maxTemp = Math.round(Math.max(...comforts));

    // Dominant weather code by severity
    const codes = indices.map(i => h.weathercode[i]).filter(v => v != null);
    const winds = indices.map(i => h.windspeed_10m[i]).filter(v => v != null);
    const codeRank = c =>
      THUNDER_CODES.has(c) ? 5 : RAINY_CODES.has(c) ? 4 :
      SNOW_CODES.has(c)    ? 3 : FOG_CODES.has(c)   ? 2 : 0;
    const dominantCode = [...codes].sort((a, b) => codeRank(b) - codeRank(a))[0] ?? 0;
    const avgWind = winds.length ? winds.reduce((s, v) => s + v, 0) / winds.length : 0;

    const slotWeatherApprox = { code: dominantCode, wind: avgWind, precipitation: 0 };
    const emojiKey = resolveEmojiKey(slotWeatherApprox, null,
      RAINY_CODES.has(dominantCode) || THUNDER_CODES.has(dominantCode));
    const emoji = EMOJI_MAP[emojiKey]?.text ?? '☁️';

    return {
      label:     slot.label,
      emoji,
      minTemp,
      maxTemp,
      isCurrent: curH >= slot.startH && curH < slot.endH,
    };
  }).filter(Boolean);
}

function updateForecastStrip(weather, now) {
  const strip = document.getElementById('forecast-strip');
  if (!strip) return;
  const hour   = now.getHours();
  const nowMin = hour * 60 + now.getMinutes();
  if (nowMin >= 18*60+30 || hour < 6) { strip.style.display = 'none'; return; }
  strip.style.display = '';

  const slots = buildForecastSlots(weather, now);
  if (!slots?.length) { strip.style.display = 'none'; return; }

  strip.innerHTML = slots.map(s => `
    <div class="forecast-slot${s.isCurrent ? ' forecast-current' : ''}">
      <span class="fs-label">${s.label}</span>
      <span class="fs-emoji">${s.emoji}</span>
      <span class="fs-temp">${s.minTemp}°–${s.maxTemp}°</span>
    </div>`).join('');
}


// ══════════════════════════════════════════════════════════════════
// 16. UI RENDERING  — state, DOM refs, main updateUI()
// ══════════════════════════════════════════════════════════════════

// ─── Global render state ──────────────────────────────────────────
let _currentScene     = 'scene-spring';
let _currentTimeOfDay = 'day';
let _lastWeather      = null;   // last successful NormalizedWeather object
let currentLioOutfit  = null;   // current image path suffix for Lio (change detection)
let currentMikaOutfit = null;
let weekendOverride   = false;  // set by tapping weather emoji on Sat/Sun morning
let _lastHour         = -1;     // for hourly re-evaluation

// ─── DOM refs ─────────────────────────────────────────────────────
const $clock     = document.getElementById('clock');
const $dayName   = document.getElementById('day-name');
const $feelsLike = document.getElementById('feels-like');
const $temp      = document.getElementById('temperature');
const $lio       = document.getElementById('lio');
const $mika      = document.getElementById('mika');
const $rainWrap  = document.querySelector('.rain-wrap');
const $leafWrap  = document.querySelector('.leaf-wrap');
const $petalWrap = document.querySelector('.petal-wrap');
const $snowWrap  = document.querySelector('.snow-wrap');
const $confWrap  = document.querySelector('.confetti-wrap');

/**
 * Main render function — called after every successful weather fetch and
 * once per hour (for time-of-day transitions like 18:30 → Sleepy).
 * Accepts the full NormalizedWeather object.
 */
function updateUI(weather) {
  _lastWeather = weather;
  const now = new Date();

  // ── Derived outdoor comfort values ─────────────────────────────
  const sunBonus     = calcSunBonus(weather, now);
  const playComfort  = getShortTermPlayComfort(weather, now);
  const rainVisual   = isRainVisual(weather, now);
  const rainClothing = isRainClothing(weather, now);

  // ── Outfit decision ─────────────────────────────────────────────
  const rawOutfit = determineOutfit(Math.round(playComfort), rainClothing, weather.code, now);
  const outfit    = applyHysteresis(rawOutfit);

  const lioSrc  = outfit + getDailyVariantSuffix(outfit, 'lio');
  const mikaSrc = outfit + getDailyVariantSuffix(outfit, 'mika');

  // ── Temperature display ─────────────────────────────────────────
  // Primary:   playComfort — what it actually feels like outdoors in the sun
  // Secondary: air temperature ("echt" = real air temp in the shade)
  $feelsLike.textContent = `${Math.round(playComfort)}°`;
  $temp.textContent      = `${Math.round(weather.temp)}° echt`;

  // ── Time of day & scene ─────────────────────────────────────────
  const timeOfDay = getTimeOfDay(now, weather.sunrise, weather.sunset);
  const scene     = getVisualScene(weather, outfit, timeOfDay, rainVisual);

  setWeatherEmoji(resolveEmojiKey(weather, outfit, rainVisual));

  // ── Re-render scene + characters only when something changed ────
  const sceneChanged =
    lioSrc  !== currentLioOutfit  ||
    mikaSrc !== currentMikaOutfit ||
    scene   !== _currentScene;

  if (sceneChanged) {
    currentLioOutfit  = lioSrc;
    currentMikaOutfit = mikaSrc;

    $lio.src  = `images/Lio_${lioSrc}.png`;
    $mika.src = `images/Mika_${mikaSrc}.png`;
    $lio.style.visibility  = 'visible';
    $mika.style.visibility = 'visible';

    _currentScene     = scene;
    _currentTimeOfDay = timeOfDay;
    applyBodyClasses();
    renderParticles(scene, weather.code);
  } else if (timeOfDay !== _currentTimeOfDay) {
    // Scene unchanged but dawn/dusk tint changed
    _currentTimeOfDay = timeOfDay;
    applyBodyClasses();
  }

  adjustClouds(weather.cloudCover ?? 50, scene);
  updateForecastStrip(weather, now);
}


// ══════════════════════════════════════════════════════════════════
// 17. PARTICLES  — rain, leaves, petals, snow, confetti, stars
// ══════════════════════════════════════════════════════════════════

function renderParticles(scene, code = 0) {
  $rainWrap.innerHTML  = '';
  $leafWrap.innerHTML  = '';
  $petalWrap.innerHTML = '';
  $snowWrap.innerHTML  = '';
  $confWrap.innerHTML  = '';

  if (scene === 'scene-rainy')        { spawnRain(65);  spawnRipples(5); }
  if (scene === 'scene-thunderstorm') { spawnRain(105); spawnRipples(8); }

  if (scene === 'scene-fall') {
    for (let i = 0; i < 24; i++) {
      const l = document.createElement('div');
      l.className = 'leaf';
      l.style.setProperty('--drift-x', `${(Math.random() - 0.3) * 240}px`);
      l.style.left              = `${rand(0, 100)}%`;
      l.style.animationDelay    = `${rand(0, 9).toFixed(2)}s`;
      l.style.animationDuration = `${rand(5, 11).toFixed(2)}s`;
      l.style.width             = `${rand(12, 22)}px`;
      l.style.height            = `${rand(16, 28)}px`;
      l.style.background        = pick(LEAF_COLORS);
      l.style.opacity           = rand(0.70, 1.0).toFixed(2);
      $leafWrap.appendChild(l);
    }
  }

  if (scene === 'scene-windy') {
    for (let i = 0; i < 22; i++) {
      const l = document.createElement('div');
      l.className = 'leaf wind-leaf';
      l.style.setProperty('--drift-y', `${rand(10, 90)}px`);
      l.style.top               = `${rand(5, 85)}%`;
      l.style.animationDelay    = `${rand(0, 5).toFixed(2)}s`;
      l.style.animationDuration = `${rand(2.5, 5).toFixed(2)}s`;
      l.style.width             = `${rand(12, 22)}px`;
      l.style.height            = `${rand(16, 28)}px`;
      l.style.background        = pick(LEAF_COLORS);
      l.style.opacity           = rand(0.65, 0.95).toFixed(2);
      $leafWrap.appendChild(l);
    }
  }

  if (scene === 'scene-spring') {
    for (let i = 0; i < 30; i++) {
      const p = document.createElement('div');
      p.className = 'petal';
      p.style.setProperty('--drift-x', `${(Math.random() - 0.5) * 180}px`);
      p.style.left              = `${rand(0, 100)}%`;
      p.style.animationDelay    = `${rand(0, 12).toFixed(2)}s`;
      p.style.animationDuration = `${rand(7, 14).toFixed(2)}s`;
      p.style.width             = `${rand(8, 16)}px`;
      p.style.height            = `${rand(6, 12)}px`;
      p.style.background        = pick(PETAL_COLORS);
      p.style.opacity           = rand(0.65, 0.92).toFixed(2);
      $petalWrap.appendChild(p);
    }
  }

  // Snowflakes only when it is actually snowing (WMO code confirms precipitation)
  if (scene === 'scene-winter' && SNOW_CODES.has(code)) {
    for (let i = 0; i < 48; i++) {
      const s = document.createElement('div');
      s.className   = 'snowflake';
      s.textContent = '❄';
      s.style.setProperty('--drift-x', `${(Math.random() - 0.5) * 65}px`);
      s.style.left              = `${rand(0, 100)}%`;
      s.style.fontSize          = `${rand(10, 26)}px`;
      s.style.animationDelay    = `${rand(0, 9).toFixed(2)}s`;
      s.style.animationDuration = `${rand(5, 12).toFixed(2)}s`;
      s.style.opacity           = rand(0.5, 0.95).toFixed(2);
      $snowWrap.appendChild(s);
    }
    for (let i = 0; i < 10; i++) {
      const sp = document.createElement('div');
      sp.className   = 'sparkle';
      sp.textContent = '✦';
      sp.style.left              = `${rand(4, 94)}%`;
      sp.style.top               = `${rand(8, 72)}%`;
      sp.style.fontSize          = `${rand(10, 20)}px`;
      sp.style.animationDelay    = `${rand(0, 3).toFixed(2)}s`;
      sp.style.animationDuration = `${rand(1.8, 3.5).toFixed(2)}s`;
      $snowWrap.appendChild(sp);
    }
  }

  if (scene === 'scene-weekend') {
    for (let i = 0; i < 58; i++) {
      const c = document.createElement('div');
      c.className = 'confetti' + pick(['', ' circle', ' ribbon']);
      c.style.setProperty('--drift-x', `${(Math.random() - 0.5) * 170}px`);
      c.style.setProperty('--spin',    `${(Math.random() < 0.5 ? 1 : -1) * rand(360, 1080)}deg`);
      c.style.left              = `${rand(0, 100)}%`;
      c.style.background        = pick(CONFETTI_COLORS);
      c.style.animationDelay    = `${rand(0, 5.5).toFixed(2)}s`;
      c.style.animationDuration = `${rand(3, 7).toFixed(2)}s`;
      $confWrap.appendChild(c);
    }
    for (let i = 0; i < 12; i++) {
      const s = document.createElement('div');
      s.className   = 'star';
      s.textContent = '★';
      s.style.left              = `${rand(4, 94)}%`;
      s.style.top               = `${rand(4, 62)}%`;
      s.style.color             = pick(CONFETTI_COLORS);
      s.style.fontSize          = `${rand(14, 28)}px`;
      s.style.animationDelay    = `${rand(0, 2.5).toFixed(2)}s`;
      s.style.animationDuration = `${rand(1.4, 3.0).toFixed(2)}s`;
      $confWrap.appendChild(s);
    }
  }

  if (scene === 'scene-sleepy') {
    const starChars = ['✦', '✧', '·', '+', '✦', '✦'];
    for (let i = 0; i < 50; i++) {
      const s = document.createElement('div');
      s.className   = 'night-star';
      s.textContent = pick(starChars);
      s.style.left              = `${rand(1, 97)}%`;
      s.style.top               = `${rand(1, 62)}%`;
      s.style.fontSize          = `${rand(5, 18)}px`;
      s.style.color             = `rgba(255,255,${(rand(170,255))|0},${rand(0.45,1.0).toFixed(2)})`;
      s.style.animationDelay    = `${rand(0, 5).toFixed(2)}s`;
      s.style.animationDuration = `${rand(2, 6).toFixed(2)}s`;
      $snowWrap.appendChild(s);
    }
    for (let i = 0; i < 7; i++) {
      const f = document.createElement('div');
      f.className = 'firefly';
      f.style.left              = `${rand(8, 86)}%`;
      f.style.bottom            = `${rand(13, 42)}%`;
      f.style.animationDelay    = `${rand(0, 4).toFixed(2)}s`;
      f.style.animationDuration = `${rand(4, 9).toFixed(2)}s`;
      $snowWrap.appendChild(f);
    }
  }
}

function spawnRain(count) {
  for (let i = 0; i < count; i++) {
    const d = document.createElement('div');
    d.className = 'raindrop';
    d.style.left              = `${rand(0, 100)}%`;
    d.style.animationDelay    = `${rand(0, 2).toFixed(2)}s`;
    d.style.animationDuration = `${rand(0.45, 0.9).toFixed(2)}s`;
    d.style.height            = `${rand(12, 24)}px`;
    d.style.opacity           = rand(0.4, 0.85).toFixed(2);
    $rainWrap.appendChild(d);
  }
}

function spawnRipples(count) {
  for (let i = 0; i < count; i++) {
    const r = document.createElement('div');
    r.className = 'ripple';
    r.style.left              = `${rand(10, 85)}%`;
    r.style.animationDelay    = `${rand(0, 2.5).toFixed(2)}s`;
    r.style.animationDuration = `${rand(1.4, 2.8).toFixed(2)}s`;
    $rainWrap.appendChild(r);
  }
}


// ══════════════════════════════════════════════════════════════════
// 18. PIN LOCK / CLOCK / WEEKEND OVERRIDE / HELPERS / BOOT
// ══════════════════════════════════════════════════════════════════

// ─── Init ─────────────────────────────────────────────────────────
function init() {
  initPin();
  initWeekendOverride();
  buildSun();
  startClock();
  runFetch();
  setInterval(runFetch, REFRESH_MS);
}

// ─── Weather fetch wrapper ─────────────────────────────────────────
async function runFetch() {
  const loc = getActiveLocation();
  try {
    const weather = await fetchWithFallback(loc.lat, loc.lon);
    updateUI(weather);
  } catch (err) {
    console.error('[Weather] fatal — all sources failed:', err.message);
    // If data was already rendered, leave it on screen rather than showing a blank state
  }
}

// ─── Weekend override (tap weather emoji on Sat/Sun morning) ──────
function initWeekendOverride() {
  document.getElementById('weather-emoji').addEventListener('click', () => {
    const now  = new Date();
    const day  = now.getDay();
    const hour = now.getHours();
    if ((day === 0 || day === 6) && hour >= 6 && hour < 12 && !weekendOverride) {
      weekendOverride = true;
      // Reset hysteresis so the override takes effect immediately
      _stableOutfit = null; _candidateOutfit = null; _candidateCount = 0;
      if (_lastWeather) updateUI(_lastWeather);
    }
  });
}

// ─── Build sun rays (once at init) ────────────────────────────────
function buildSun() {
  const sun = document.querySelector('.sun');
  for (let i = 0; i < 12; i++) {
    const ray = document.createElement('span');
    ray.className = 'ray';
    ray.style.transform = `rotate(${i * 30}deg)`;
    sun.appendChild(ray);
  }
}

// ─── Clock (ticks every second) ───────────────────────────────────
function startClock() {
  updateClock();
  setInterval(updateClock, 1000);
}

function updateClock() {
  const now  = new Date();
  const h    = String(now.getHours()).padStart(2, '0');
  const m    = String(now.getMinutes()).padStart(2, '0');
  $clock.textContent   = `${h}:${m}`;
  $dayName.textContent = DAYS_DE[now.getDay()];

  // Update time-of-day tint every second (smooth dawn/dusk transitions)
  const todNew = getTimeOfDay(now, _sunriseISO, _sunsetISO);
  if (todNew !== _currentTimeOfDay) {
    _currentTimeOfDay = todNew;
    applyBodyClasses();
  }

  // Once per hour: re-evaluate outfit to catch 18:30→Sleepy, 06:00→wake-up, etc.
  const hourNow = now.getHours();
  if (hourNow !== _lastHour) {
    _lastHour = hourNow;
    const isWeekendMorning = (now.getDay() === 0 || now.getDay() === 6) &&
                              hourNow >= 6 && hourNow < 12;
    if (!isWeekendMorning) weekendOverride = false;
    if (_lastWeather) updateUI(_lastWeather);
  }
}

// ─── PIN Lock ─────────────────────────────────────────────────────
function initPin() {
  const until = parseInt(localStorage.getItem('wf_unlocked_until') || '0');
  if (until > Date.now()) {
    document.getElementById('pin-overlay').style.display = 'none';
    return;
  }
  document.querySelectorAll('.pin-btn[data-n]').forEach(btn => {
    btn.addEventListener('click', () => pinAddDigit(btn.dataset.n));
  });
  document.getElementById('pin-backspace').addEventListener('click', pinRemoveDigit);
}

let _pin = '';

function pinAddDigit(d) {
  if (_pin.length >= 4) return;
  _pin += d;
  pinUpdateDots();
  if (_pin.length === 4) pinCheck();
}
function pinRemoveDigit() {
  _pin = _pin.slice(0, -1);
  pinUpdateDots();
}
function pinUpdateDots() {
  document.querySelectorAll('#pin-dots .dot').forEach((dot, i) => {
    dot.classList.toggle('filled', i < _pin.length);
  });
}
function pinCheck() {
  if (_pin === PIN_CODE) {
    const until = Date.now() + PIN_DAYS * 24 * 60 * 60 * 1000;
    localStorage.setItem('wf_unlocked_until', String(until));
    document.getElementById('pin-overlay').style.display = 'none';
  } else {
    const box = document.getElementById('pin-box');
    document.getElementById('pin-error').textContent = 'Falscher PIN 🙈';
    box.classList.add('shake');
    setTimeout(() => {
      box.classList.remove('shake');
      document.getElementById('pin-error').textContent = '';
      _pin = '';
      pinUpdateDots();
    }, 800);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────
function rand(min, max) { return Math.random() * (max - min) + min; }
function pick(arr)      { return arr[Math.floor(Math.random() * arr.length)]; }

// ─── Boot ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
