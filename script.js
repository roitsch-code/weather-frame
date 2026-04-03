/* ═══════════════════════════════════════════════════
   Lio & Mika's Weather — script.js
   Weather data: Open-Meteo (free, no API key)
   Location: Düsseldorf, DE (51.2217°N, 6.7762°E)
   ═══════════════════════════════════════════════════ */

// ─── PIN Configuration ───────────────────────────────
const PIN_CODE = '1234'; // ← change to your 4-digit PIN
const PIN_DAYS = 30;     // days before asking again

// ─── API ─────────────────────────────────────────────
// ─── Location (with temporary override) ──────────────
const LOCATION_DÜSSELDORF = { lat: 51.22, lon: 6.78 };

// Temporary away location — remove or update for future trips
const LOCATION_OVERRIDE = {
  label:   'Emmerich am Rhein',
  lat:     51.84,
  lon:     6.25,
  startMs: new Date('2026-04-04T16:00:00+02:00').getTime(),
  endMs:   new Date('2026-04-06T20:00:00+02:00').getTime(),
};

function getApiUrl() {
  const now = Date.now();
  const loc =
    (now >= LOCATION_OVERRIDE.startMs && now < LOCATION_OVERRIDE.endMs)
      ? LOCATION_OVERRIDE
      : LOCATION_DÜSSELDORF;
  return 'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${loc.lat}&longitude=${loc.lon}` +
    '&current=temperature_2m,apparent_temperature,precipitation,' +
    'weathercode,windspeed_10m,cloudcover,is_day' +
    '&hourly=apparent_temperature,temperature_2m,precipitation,weathercode,windspeed_10m' +
    '&daily=sunrise,sunset' +
    '&forecast_days=1' +
    '&timezone=Europe%2FBerlin';
}

const REFRESH_MS = 15 * 60 * 1000; // 15 min — weather fetch interval
const RELOAD_MS  = 30 * 60 * 1000; // 30 min — reload after fetch (picks up new deploys)
let   _lastReloadMs = Date.now();  // tracks when we last reloaded

// ─── Lookup tables ───────────────────────────────────
const DAYS_DE = [
  'Sonntag', 'Montag', 'Dienstag', 'Mittwoch',
  'Donnerstag', 'Freitag', 'Samstag'
];

// WMO codes — rainy (drizzle, rain, showers — NOT thunderstorm or fog)
const RAINY_CODES = new Set([
  51, 53, 55, 56, 57,
  61, 63, 65, 66, 67,
  80, 81, 82
]);
const THUNDER_CODES = new Set([95, 96, 99]);
const FOG_CODES     = new Set([45, 48]);
const SNOW_CODES    = new Set([71, 73, 75, 77, 85, 86]); // actual snowfall WMO codes

const CONFETTI_COLORS = [
  '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff',
  '#ff922b', '#f78fb3', '#a29bfe', '#74b9ff'
];
const LEAF_COLORS = [
  '#e67e22', '#c0392b', '#f39c12',
  '#d35400', '#8B0000', '#DAA520', '#b7451a'
];
const PETAL_COLORS = [
  '#ffcce0', '#ffb3cc', '#ff91b8', '#ffe0ec',
  '#ffffff', '#ffd6e7', '#ffadd2'
];

// ─── Season helper ───────────────────────────────────
// Winter: Dec–Mar 31 | Spring: Apr–May | Summer: Jun–Aug | Fall: Sep–Nov 15
// Winter resumes Nov 16+
function getCurrentSeason() {
  const now = new Date();
  const m   = now.getMonth(); // 0-based
  const d   = now.getDate();
  if (m === 11 || m <= 2)             return 'winter'; // Dec, Jan, Feb, Mar
  if (m === 3 || m === 4)             return 'spring'; // Apr, May
  if (m >= 5 && m <= 7)              return 'summer'; // Jun–Aug
  if (m === 8 || m === 9)            return 'fall';   // Sep, Oct
  if (m === 10) return d <= 15 ? 'fall' : 'winter';   // Nov 1-15 fall, 16+ winter
  return 'winter';
}

// ─── Time-of-day helpers ─────────────────────────────
// Parse "2026-04-01T06:42" → minutes since midnight
function isoToMinutes(isoStr) {
  if (!isoStr) return null;
  const t = isoStr.split('T')[1];
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// Returns 'dawn' | 'day' | 'dusk' | 'night'
// Note: 'night' here means pre-dawn (< 06:00); after 18:30 is handled by Sleepy outfit
function getTimeOfDay(now, sunriseISO, sunsetISO) {
  const h      = now.getHours();
  const nowMin = h * 60 + now.getMinutes();
  const srMin  = isoToMinutes(sunriseISO);
  const ssMin  = isoToMinutes(sunsetISO);

  if (h < 6)          return 'night'; // before kids wake up
  if (nowMin >= 18*60+30) return 'night'; // after 18:30 — Sleepy mode

  if (srMin !== null && nowMin < srMin + 55) return 'dawn';
  if (ssMin !== null && nowMin > ssMin - 70)  return 'dusk';
  return 'day';
}

// ─── Scene selection ─────────────────────────────────
function getScene(outfit, code, windSpeed) {
  if (outfit === 'Sleepy')                                    return 'scene-sleepy';
  if (outfit === 'Weekend')                                   return 'scene-weekend';
  if (FOG_CODES.has(code))                                    return 'scene-foggy';
  if (THUNDER_CODES.has(code))                                return 'scene-thunderstorm';
  if (outfit === 'Rainy' || outfit === 'Summer_Rainy')        return 'scene-rainy';
  if (outfit === 'Winter_Cold')                               return 'scene-winter';
  if (windSpeed > 30)                                         return 'scene-windy';
  if (code >= 3)                                              return 'scene-cloudy';
  if (outfit === 'Summer_Warm' || outfit === 'Summer_Hot')    return 'scene-sunny';
  const season = getCurrentSeason();
  return (season === 'fall') ? 'scene-fall' : 'scene-spring';
}

// ─── Body class manager ───────────────────────────────
// Body always carries two classes: scene + time-of-day
function applyBodyClasses() {
  const next = `${_currentScene} time-${_currentTimeOfDay}`;
  if (document.body.className !== next) document.body.className = next;
}

// ─── Pixar-style emoji support ────────────────────────
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

function resolveEmojiKey(outfit, code, windSpeed) {
  if (outfit === 'Sleepy')                                return 'sleepy';
  if (outfit === 'Weekend')                               return 'weekend';
  if (FOG_CODES.has(code))                               return 'foggy';
  if (THUNDER_CODES.has(code))                           return 'thunderstorm';
  if (outfit === 'Rainy' || outfit === 'Summer_Rainy')   return 'rainy';
  if (outfit === 'Winter_Cold')                          return 'winter';
  if (windSpeed > 30)                                    return 'windy';
  if (code === 0)                                        return 'sunny';
  if (code <= 2)                                         return 'partly_cloudy';
  return 'cloudy';
}

// ─── Daily outfit variants ───────────────────────────
// Lists variant suffixes per outfit per character (null = no suffix = original image)
const OUTFIT_VARIANTS = {
  'Sleepy':           { lio: [null, '_2', '_3', '_4'],        mika: [null, '_2', '_3', '_4', '_5'] },
  'Spring_Fall_Mild': { lio: [null, '_2', '_4'],              mika: [null] },
  'Spring_Fall_Warm': { lio: [null, '_2'],                    mika: [null, '_2'] },
};

function getDailyVariantSuffix(outfit, character) {
  const entry = OUTFIT_VARIANTS[outfit];
  if (!entry) return '';
  const list = entry[character];
  if (!list || list.length <= 1) return '';
  const d   = new Date();
  const idx = (d.getFullYear() * 366 + d.getMonth() * 31 + d.getDate()) % list.length;
  return list[idx] ?? '';
}

// ─── Forecast strip slots ────────────────────────────
// label, start hour (inclusive), end hour (exclusive)
const FORECAST_SLOTS = [
  { label: 'Morgens',    startH: 6,  endH: 11 },
  { label: 'Mittags',    startH: 11, endH: 14 },
  { label: 'Nachmittag', startH: 14, endH: 17 },
  { label: 'Abends',     startH: 17, endH: 19 },
];

// ─── State ───────────────────────────────────────────
let _currentScene      = 'scene-spring';
let _currentTimeOfDay  = 'day';
let currentLioOutfit   = null; // effective src for Lio (may include _2/_3/etc.)
let currentMikaOutfit  = null; // effective src for Mika
let currentCode        = null;
let currentWind        = null;
let weekendOverride    = false;

// Cached last weather values — for hourly re-evaluation
let _lastTemp       = null;
let _lastApparent   = null;
let _lastCode       = null;
let _lastWind       = null;
let _lastCloud      = null;
let _lastHour       = -1;
let _sunriseISO     = null;
let _sunsetISO      = null;
let _hourlyData     = null; // cached hourly forecast

// ─── DOM refs ────────────────────────────────────────
const $clock      = document.getElementById('clock');
const $dayName    = document.getElementById('day-name');
const $feelsLike  = document.getElementById('feels-like');
const $temp       = document.getElementById('temperature');
const $lio        = document.getElementById('lio');
const $mika       = document.getElementById('mika');
const $rainWrap   = document.querySelector('.rain-wrap');
const $leafWrap   = document.querySelector('.leaf-wrap');
const $petalWrap  = document.querySelector('.petal-wrap');
const $snowWrap   = document.querySelector('.snow-wrap');
const $confWrap   = document.querySelector('.confetti-wrap');

// ─── Init ─────────────────────────────────────────────
function init() {
  initPin();
  initWeekendOverride();
  buildSun();
  startClock();
  fetchWeather();
  setInterval(fetchWeather, REFRESH_MS);
}

// ─── Weekend override (tap weather emoji) ─────────────
function initWeekendOverride() {
  document.getElementById('weather-emoji').addEventListener('click', () => {
    const now  = new Date();
    const day  = now.getDay();
    const hour = now.getHours();
    const isWeekendMorning = (day === 0 || day === 6) && hour >= 6 && hour < 12;
    if (isWeekendMorning && !weekendOverride) {
      weekendOverride = true;
      // Force re-render with override active
      currentLioOutfit = null;
      currentMikaOutfit = null;
      if (_lastTemp !== null) {
        updateUI(_lastTemp, _lastApparent, _lastCode, _lastWind, _lastCloud);
      }
    }
  });
}

// ─── Build sun rays (once) ────────────────────────────
function buildSun() {
  const sun = document.querySelector('.sun');
  for (let i = 0; i < 12; i++) {
    const ray = document.createElement('span');
    ray.className = 'ray';
    ray.style.transform = `rotate(${i * 30}deg)`;
    sun.appendChild(ray);
  }
}

// ─── Clock (ticks every second) ──────────────────────
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

  // Update time-of-day tint (dawn/dusk/night)
  _currentTimeOfDay = getTimeOfDay(now, _sunriseISO, _sunsetISO);
  applyBodyClasses();

  // Once per hour: re-evaluate outfit to catch 19:00→Sleepy, 07:00→wake-up, etc.
  const hourNow = now.getHours();
  if (hourNow !== _lastHour) {
    _lastHour = hourNow;
    // Reset weekend override once it's past weekend morning
    const isWeekendMorning = (now.getDay() === 0 || now.getDay() === 6) &&
                              hourNow >= 6 && hourNow < 12;
    if (!isWeekendMorning) weekendOverride = false;
    // Re-render with fresh time
    if (_lastTemp !== null) {
      updateUI(_lastTemp, _lastApparent, _lastCode, _lastWind, _lastCloud);
    } else {
      // At minimum refresh the forecast strip visibility (slot disappearance)
      updateForecastStrip(now);
    }
  }
}

// ─── Weather fetch ────────────────────────────────────
async function fetchWeather() {
  try {
    const res  = await fetch(getApiUrl());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const c    = data.current;

    // Cache today's sunrise / sunset
    if (data.daily) {
      _sunriseISO = data.daily.sunrise[0] || null;
      _sunsetISO  = data.daily.sunset[0]  || null;
    }

    // Cache hourly forecast for smart outfit + strip
    if (data.hourly) {
      _hourlyData = data.hourly;
    }

    updateUI(c.temperature_2m, c.apparent_temperature, c.weathercode,
             c.windspeed_10m, c.cloudcover);

    // If 30 min have passed, reload 5 s after the fetch so the UI shows
    // fresh data for a moment before the page restarts with new code.
    if (Date.now() - _lastReloadMs >= RELOAD_MS) {
      setTimeout(() => {
        const pinVisible = document.getElementById('pin-overlay').style.display !== 'none';
        if (!pinVisible) location.reload();
      }, 5000);
    }
  } catch (err) {
    console.warn('Weather fetch failed:', err.message);
  }
}

// ─── Smart outfit helpers ─────────────────────────────

// Returns the minimum apparent_temperature in the next 3 hours (falls back to rawApparent)
function getSmartApparentTemp(hourlyData, rawApparent, now) {
  if (!hourlyData || !hourlyData.time) return rawApparent;
  const nowMs = now.getTime();
  const cap   = nowMs + 3 * 60 * 60 * 1000; // now + 3 h
  let min = rawApparent;
  for (let i = 0; i < hourlyData.time.length; i++) {
    const tMs = new Date(hourlyData.time[i]).getTime();
    if (tMs >= nowMs && tMs <= cap) {
      const v = hourlyData.apparent_temperature[i];
      if (v !== null && v < min) min = v;
    }
  }
  return min;
}

// Returns true if total precipitation in next 3 h > 2mm AND a rainy WMO code is present
function isHeavyRainAhead(hourlyData, now) {
  if (!hourlyData || !hourlyData.time) return false;
  const nowMs = now.getTime();
  const cap   = nowMs + 3 * 60 * 60 * 1000;
  let totalPrecip  = 0;
  let hasRainyCode = false;
  for (let i = 0; i < hourlyData.time.length; i++) {
    const tMs = new Date(hourlyData.time[i]).getTime();
    if (tMs >= nowMs && tMs <= cap) {
      totalPrecip  += hourlyData.precipitation[i] ?? 0;
      const code    = hourlyData.weathercode[i];
      if (RAINY_CODES.has(code) || THUNDER_CODES.has(code)) hasRainyCode = true;
    }
  }
  return hasRainyCode && totalPrecip > 2;
}

// ─── Forecast strip helpers ───────────────────────────

function buildForecastSlots(hourlyData, now) {
  if (!hourlyData || !hourlyData.time) return null;
  const curH = now.getHours();

  return FORECAST_SLOTS.map(slot => {
    if (slot.endH <= curH) return null; // slot has fully passed

    const indices = [];
    for (let i = 0; i < hourlyData.time.length; i++) {
      const h = new Date(hourlyData.time[i]).getHours();
      if (h >= slot.startH && h < slot.endH) indices.push(i);
    }
    if (indices.length === 0) return null;

    const apparents = indices.map(i => hourlyData.apparent_temperature[i]).filter(v => v !== null);
    const codes     = indices.map(i => hourlyData.weathercode[i]).filter(v => v !== null);
    const winds     = indices.map(i => hourlyData.windspeed_10m[i]).filter(v => v !== null);

    if (apparents.length === 0) return null;

    const minTemp = Math.round(Math.min(...apparents));
    const maxTemp = Math.round(Math.max(...apparents));

    const codeRank = c =>
      THUNDER_CODES.has(c) ? 5 : RAINY_CODES.has(c) ? 4 :
      SNOW_CODES.has(c)    ? 3 : FOG_CODES.has(c)   ? 2 : 0;
    const dominantCode = [...codes].sort((a, b) => codeRank(b) - codeRank(a))[0] ?? 0;
    const avgWind = winds.length ? winds.reduce((s, v) => s + v, 0) / winds.length : 0;

    const emojiKey = resolveEmojiKey(null, dominantCode, avgWind);
    const emoji    = EMOJI_MAP[emojiKey]?.text ?? '☁️';

    return {
      label:     slot.label,
      emoji,
      minTemp,
      maxTemp,
      isCurrent: curH >= slot.startH && curH < slot.endH,
    };
  }).filter(Boolean);
}

function updateForecastStrip(now) {
  const strip = document.getElementById('forecast-strip');
  if (!strip) return;

  const hour   = now.getHours();
  const nowMin = hour * 60 + now.getMinutes();
  if (nowMin >= 18*60+30 || hour < 6) { strip.style.display = 'none'; return; }
  strip.style.display = '';

  const slots = buildForecastSlots(_hourlyData, now);
  if (!slots || slots.length === 0) { strip.style.display = 'none'; return; }

  strip.innerHTML = slots.map(s => `
    <div class="forecast-slot${s.isCurrent ? ' forecast-current' : ''}">
      <span class="fs-label">${s.label}</span>
      <span class="fs-emoji">${s.emoji}</span>
      <span class="fs-temp">${s.minTemp}°–${s.maxTemp}°</span>
    </div>`).join('');
}

// ─── Update UI ────────────────────────────────────────
function updateUI(tempRaw, apparentRaw, weatherCode, windSpeed, cloudCover) {
  const now    = new Date();
  const temp   = Math.round(tempRaw);
  const felt   = Math.round(apparentRaw ?? tempRaw); // fallback if apparent absent

  // Cache for hourly re-evaluation
  _lastTemp = tempRaw; _lastApparent = apparentRaw;
  _lastCode = weatherCode; _lastWind = windSpeed; _lastCloud = cloudCover;

  const smartTemp = getSmartApparentTemp(_hourlyData, apparentRaw ?? tempRaw, now);
  const rainGear  = isHeavyRainAhead(_hourlyData, now);
  // If heavy rain is coming but current code isn't rainy yet, inject code 61 (moderate rain)
  const effectiveCode = rainGear && !RAINY_CODES.has(weatherCode) && !THUNDER_CODES.has(weatherCode)
                        ? 61 : weatherCode;
  const outfit   = determineOutfit(smartTemp, effectiveCode, now);
  const lioSrc   = outfit + getDailyVariantSuffix(outfit, 'lio');
  const mikaSrc  = outfit + getDailyVariantSuffix(outfit, 'mika');

  // Update temperatures
  $feelsLike.textContent = `${felt}°`;
  $temp.textContent      = `${temp}° echt`;

  setWeatherEmoji(resolveEmojiKey(outfit, weatherCode, windSpeed));

  // Re-render scene + characters when state changes
  const sceneChanged =
    lioSrc              !== currentLioOutfit  ||
    mikaSrc             !== currentMikaOutfit ||
    weatherCode         !== currentCode       ||
    (windSpeed > 30)    !== (currentWind > 30);

  if (sceneChanged) {
    currentLioOutfit  = lioSrc;
    currentMikaOutfit = mikaSrc;
    currentCode       = weatherCode;
    currentWind       = windSpeed;

    $lio.src  = `images/Lio_${lioSrc}.png`;
    $mika.src = `images/Mika_${mikaSrc}.png`;
    $lio.style.visibility  = 'visible';
    $mika.style.visibility = 'visible';

    _currentScene     = getScene(outfit, weatherCode, windSpeed);
    _currentTimeOfDay = getTimeOfDay(now, _sunriseISO, _sunsetISO);
    applyBodyClasses();
    renderParticles(_currentScene, weatherCode);
  }

  // Always update cloud density (smooth transition)
  adjustClouds(cloudCover ?? 50, _currentScene);

  // Update forecast strip
  updateForecastStrip(now);
}

// ─── Outfit logic (priority order) ───────────────────
function determineOutfit(temp, code, now) {
  const day    = now.getDay();
  const hour   = now.getHours();
  const minute = now.getMinutes();
  const m      = now.getMonth();
  const d      = now.getDate();

  // Sleepy: 18:30–06:00
  const isSleepy         = (hour > 18 || (hour === 18 && minute >= 30)) || hour < 6;
  const isWeekendMorning = (day === 0 || day === 6) && hour >= 6 && hour < 12 && !(hour === 18 && minute >= 30);
  const isRainy          = RAINY_CODES.has(code) || THUNDER_CODES.has(code);

  // Winter outfit only valid Dec–Mar and Nov 16+; Apr–Nov 15 use Spring_Fall_Cold instead
  const isCalendarWinter = m === 11 || m <= 2 || (m === 10 && d > 15);

  if (isSleepy)                              return 'Sleepy';
  if (isWeekendMorning && !weekendOverride)  return 'Weekend';
  if (isRainy && temp > 20)                  return 'Summer_Rainy';
  if (isRainy && temp > 3)                   return 'Rainy';
  if (temp <= 3 && isCalendarWinter)         return 'Winter_Cold';
  if (temp <= 10)                            return 'Spring_Fall_Cold';
  if (temp <= 15)                            return 'Spring_Fall_Mild';
  if (temp <= 20)                            return 'Spring_Fall_Warm';
  if (temp <= 25)                            return 'Summer_Warm';
  return 'Summer_Hot';
}

// ─── Cloud density adjustment ─────────────────────────
// Shows 0–4 clouds proportional to actual cloud-cover %.
function adjustClouds(cloudCover, scene) {
  // Precipitation / heavy scenes always show full cloud cover
  if (scene === 'scene-rainy' || scene === 'scene-thunderstorm' || scene === 'scene-cloudy') {
    cloudCover = 100;
  }
  // No clouds in these scenes (CSS already hides cloud-wrap)
  if (scene === 'scene-sleepy' || scene === 'scene-winter' || scene === 'scene-foggy') return;

  const thresholds = [5, 32, 58, 78]; // % needed to show each cloud in order
  document.querySelectorAll('.cloud').forEach((cloud, i) => {
    cloud.style.transition = 'opacity 2.5s ease';
    cloud.style.opacity    = cloudCover >= thresholds[i] ? '1' : '0';
  });
}

// ─── Particle renderer ────────────────────────────────
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

  // Only spawn snowflakes if it is actually snowing (WMO code confirms precipitation)
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

  // ── Sleepy: twinkling stars + fireflies ──
  if (scene === 'scene-sleepy') {
    const starChars = ['✦', '✧', '·', '+', '✦', '✦'];
    for (let i = 0; i < 50; i++) {
      const s = document.createElement('div');
      s.className   = 'night-star';
      s.textContent = pick(starChars);
      s.style.left              = `${rand(1, 97)}%`;
      s.style.top               = `${rand(1, 62)}%`;
      s.style.fontSize          = `${rand(5, 18)}px`;
      s.style.color             = `rgba(255, 255, ${(rand(170, 255)) | 0}, ${rand(0.45, 1.0).toFixed(2)})`;
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

// ─── Shared rain spawn helpers ────────────────────────
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

// ─── PIN Lock ─────────────────────────────────────────
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

// ─── Helpers ──────────────────────────────────────────
function rand(min, max) { return Math.random() * (max - min) + min; }
function pick(arr)      { return arr[Math.floor(Math.random() * arr.length)]; }

// ─── Boot ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
