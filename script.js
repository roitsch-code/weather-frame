/* ═══════════════════════════════════════════════════
   Lio & Mika's Weather — script.js
   Weather data: Open-Meteo (free, no API key)
   Location: Düsseldorf, DE (51.2217°N, 6.7762°E)
   ═══════════════════════════════════════════════════ */

// ─── PIN Configuration ───────────────────────────────
const PIN_CODE = '1234'; // ← change to your 4-digit PIN
const PIN_DAYS = 30;     // days before asking again

// ─── API ─────────────────────────────────────────────
const API_URL =
  'https://api.open-meteo.com/v1/forecast' +
  '?latitude=51.22&longitude=6.78' +
  '&current=temperature_2m,apparent_temperature,precipitation,' +
  'weathercode,windspeed_10m,cloudcover,is_day' +
  '&daily=sunrise,sunset' +
  '&timezone=Europe%2FBerlin';

const REFRESH_MS = 30 * 60 * 1000; // 30 minutes

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
function getCurrentSeason() {
  const m = new Date().getMonth();
  if (m >= 2 && m <= 4) return 'spring';
  if (m >= 5 && m <= 7) return 'summer';
  if (m >= 8 && m <= 10) return 'fall';
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
// Note: 'night' here means pre-dawn (< 07:00); after 19:00 is handled by Sleepy outfit
function getTimeOfDay(now, sunriseISO, sunsetISO) {
  const h      = now.getHours();
  const nowMin = h * 60 + now.getMinutes();
  const srMin  = isoToMinutes(sunriseISO);
  const ssMin  = isoToMinutes(sunsetISO);

  if (h < 6)  return 'night'; // before kids wake up
  if (h >= 19) return 'night'; // after kids' bedtime (Sleepy mode handles outfit)

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
const DAILY_VARIANT_OUTFITS = new Set(['Spring_Fall_Mild']);

function getDailyVariantIndex() {
  const d = new Date();
  const days = d.getFullYear() * 366 + d.getMonth() * 31 + d.getDate();
  return days % 2;
}

function resolveOutfitSrc(outfit) {
  if (DAILY_VARIANT_OUTFITS.has(outfit) && getDailyVariantIndex() === 1) {
    return outfit + '_2';
  }
  return outfit;
}

// ─── State ───────────────────────────────────────────
let _currentScene      = 'scene-spring';
let _currentTimeOfDay  = 'day';
let currentOutfit      = null; // effective src (may include _2)
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
      currentOutfit = null;
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
    }
  }
}

// ─── Weather fetch ────────────────────────────────────
async function fetchWeather() {
  try {
    const res  = await fetch(API_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const c    = data.current;

    // Cache today's sunrise / sunset
    if (data.daily) {
      _sunriseISO = data.daily.sunrise[0] || null;
      _sunsetISO  = data.daily.sunset[0]  || null;
    }

    updateUI(c.temperature_2m, c.apparent_temperature, c.weathercode,
             c.windspeed_10m, c.cloudcover);
  } catch (err) {
    console.warn('Weather fetch failed:', err.message);
  }
}

// ─── Update UI ────────────────────────────────────────
function updateUI(tempRaw, apparentRaw, weatherCode, windSpeed, cloudCover) {
  const now    = new Date();
  const temp   = Math.round(tempRaw);
  const felt   = Math.round(apparentRaw ?? tempRaw); // fallback if apparent absent

  // Cache for hourly re-evaluation
  _lastTemp = tempRaw; _lastApparent = apparentRaw;
  _lastCode = weatherCode; _lastWind = windSpeed; _lastCloud = cloudCover;

  const outfit    = determineOutfit(apparentRaw ?? tempRaw, weatherCode, now);
  const outfitSrc = resolveOutfitSrc(outfit);

  // Update temperatures
  $feelsLike.textContent = `${felt}°`;
  $temp.textContent      = `${temp}° echt`;

  setWeatherEmoji(resolveEmojiKey(outfit, weatherCode, windSpeed));

  // Re-render scene + characters when state changes
  const sceneChanged =
    outfitSrc     !== currentOutfit ||
    weatherCode   !== currentCode   ||
    (windSpeed > 30) !== (currentWind > 30);

  if (sceneChanged) {
    currentOutfit = outfitSrc;
    currentCode   = weatherCode;
    currentWind   = windSpeed;

    $lio.src  = `images/Lio_${outfitSrc}.png`;
    $mika.src = `images/Mika_${outfitSrc}.png`;
    $lio.style.visibility  = 'visible';
    $mika.style.visibility = 'visible';

    _currentScene     = getScene(outfit, weatherCode, windSpeed);
    _currentTimeOfDay = getTimeOfDay(now, _sunriseISO, _sunsetISO);
    applyBodyClasses();
    renderParticles(_currentScene, weatherCode);
  }

  // Always update cloud density (smooth transition)
  adjustClouds(cloudCover ?? 50, _currentScene);
}

// ─── Outfit logic (priority order) ───────────────────
function determineOutfit(temp, code, now) {
  const day  = now.getDay();
  const hour = now.getHours();

  const isSleepy         = hour >= 19 || hour < 6;
  const isWeekendMorning = (day === 0 || day === 6) && hour >= 6 && hour < 12;
  const isRainy          = RAINY_CODES.has(code) || THUNDER_CODES.has(code);

  if (isSleepy)                              return 'Sleepy';
  if (isWeekendMorning && !weekendOverride)  return 'Weekend';
  if (isRainy && temp > 20)                  return 'Summer_Rainy';
  if (isRainy && temp > 3)                   return 'Rainy';
  if (temp <= 3)                             return 'Winter_Cold';
  if (temp <= 10)                            return 'Spring_Fall_Cold';
  if (temp <= 15)                            return 'Spring_Fall_Mild'; // was 16
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

// ─── Auto-reload for code deploys ────────────────────
// Reloads every 30 min to pick up new GitHub Pages deploys.
// Skipped if the PIN overlay is currently visible (prevents interrupting entry).
setInterval(() => {
  const pinVisible = document.getElementById('pin-overlay').style.display !== 'none';
  if (!pinVisible) location.reload();
}, 30 * 60 * 1000);

// ─── Boot ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
