/* ═══════════════════════════════════════════════════
   Lio & Mika's Weather — script.js
   Weather data: Open-Meteo (free, no API key)
   Location: Düsseldorf, DE (51.2217°N, 6.7762°E)
   ═══════════════════════════════════════════════════ */

// ─── PIN Configuration ───────────────────────────────
const PIN_CODE    = '1234'; // ← change to your 4-digit PIN
const PIN_DAYS    = 30;     // how many days before asking again

// ─── API ─────────────────────────────────────────────
const API_URL =
  'https://api.open-meteo.com/v1/forecast' +
  '?latitude=51.2217&longitude=6.7762' +
  '&current=temperature_2m,precipitation,weathercode,windspeed_10m';

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

// WMO codes — thunderstorm
const THUNDER_CODES = new Set([95, 96, 99]);

// WMO codes — fog / icy fog
const FOG_CODES = new Set([45, 48]);

const CONFETTI_COLORS = [
  '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff',
  '#ff922b', '#f78fb3', '#a29bfe', '#74b9ff'
];

const LEAF_COLORS = [
  '#e67e22', '#c0392b', '#f39c12',
  '#d35400', '#8B0000', '#DAA520', '#b7451a'
];

// Cherry-blossom petal colours (soft pink / white / blush)
const PETAL_COLORS = [
  '#ffcce0', '#ffb3cc', '#ff91b8', '#ffe0ec',
  '#ffffff', '#ffd6e7', '#ffadd2'
];

// ─── Season helper ───────────────────────────────────
function getCurrentSeason() {
  const m = new Date().getMonth(); // 0 = Jan … 11 = Dec
  if (m >= 2 && m <= 4) return 'spring'; // Mar–May
  if (m >= 5 && m <= 7) return 'summer'; // Jun–Aug
  if (m >= 8 && m <= 10) return 'fall';  // Sep–Nov
  return 'winter';                        // Dec–Feb
}

// ─── Scene selection ─────────────────────────────────
// Maps weather state → CSS scene class, accounting for
// calendar season (Spring vs Fall look different).
function getScene(outfit, code, windSpeed) {
  if (outfit === 'Weekend')         return 'scene-weekend';
  if (FOG_CODES.has(code))          return 'scene-foggy';
  if (THUNDER_CODES.has(code))      return 'scene-thunderstorm';
  if (outfit === 'Rainy')           return 'scene-rainy';
  if (outfit === 'Winter_Cold')     return 'scene-winter';
  if (windSpeed > 30)               return 'scene-windy';
  if (code >= 3)                    return 'scene-cloudy';
  if (outfit === 'Summer_Warm' || outfit === 'Summer_Hot') return 'scene-sunny';

  // Spring_Fall_* → show the correct seasonal background
  const season = getCurrentSeason();
  return (season === 'fall') ? 'scene-fall' : 'scene-spring';
}

// ─── Pixar-style emoji support ────────────────────────
// Drop PNG files in images/ named exactly as below.
// If the file exists the <img> shows; if not, falls back to text emoji.
const EMOJI_MAP = {
  sunny:         { img: 'Sunshine.png',          text: '🌞' },
  partly_cloudy: { img: 'Sunny with Clouds.png', text: '⛅' },
  cloudy:        { img: 'Cloudy.png',            text: '☁️' },
  rainy:         { img: 'Rain.png',              text: '🌧️' },
  thunderstorm:  { img: 'Thunderstorm.png',      text: '⛈️' },
  winter:        { img: 'Snow.png',              text: '⛄' },
  windy:         { img: 'Windy.png',             text: '💨' },
  foggy:         { img: 'Cloudy.png',            text: '🌫️' }, // fog = cloudy icon + fog emoji fallback
  weekend:       { img: 'Rainbow.png',           text: '🥳' },
};

function setWeatherEmoji(key) {
  const entry = EMOJI_MAP[key] || EMOJI_MAP.sunny;
  const $e    = document.getElementById('weather-emoji');

  // Try image first; fall back to text emoji on error
  const img = new Image();
  img.onload = () => {
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
  if (outfit === 'Weekend')              return 'weekend';
  if (FOG_CODES.has(code))              return 'foggy';
  if (THUNDER_CODES.has(code))          return 'thunderstorm';
  if (outfit === 'Rainy')               return 'rainy';
  if (outfit === 'Winter_Cold')         return 'winter';
  if (windSpeed > 30)                   return 'windy';
  if (code === 0)                       return 'sunny';
  if (code <= 2)                        return 'partly_cloudy';
  return 'cloudy';
}

// ─── Daily outfit variants ───────────────────────────
// Outfits that have an alternate (_2) version to rotate through daily.
const DAILY_VARIANT_OUTFITS = new Set(['Spring_Fall_Mild']);

// Returns 0 or 1 — changes once per local calendar day (at midnight).
function getDailyVariantIndex() {
  const d = new Date();
  // Simple day-of-year hash that flips each calendar day in local time
  const days = d.getFullYear() * 366 + d.getMonth() * 31 + d.getDate();
  return days % 2;
}

// Returns outfit name, appending '_2' on alternate days when a variant exists.
function resolveOutfitSrc(outfit) {
  if (DAILY_VARIANT_OUTFITS.has(outfit) && getDailyVariantIndex() === 1) {
    return outfit + '_2';
  }
  return outfit;
}

// ─── State ───────────────────────────────────────────
let currentOutfit = null; // stores effective outfit src (may include _2)
let currentCode   = null;
let currentWind   = null;

// ─── DOM refs ────────────────────────────────────────
const $clock      = document.getElementById('clock');
const $dayName    = document.getElementById('day-name');
const $temp       = document.getElementById('temperature');
const $lio        = document.getElementById('lio');
const $mika       = document.getElementById('mika');
const $rainWrap   = document.querySelector('.rain-wrap');
const $leafWrap   = document.querySelector('.leaf-wrap');
const $petalWrap  = document.querySelector('.petal-wrap');
const $snowWrap   = document.querySelector('.snow-wrap');
const $confWrap   = document.querySelector('.confetti-wrap');

// ─── PIN Lock ─────────────────────────────────────────
function initPin() {
  const until = parseInt(localStorage.getItem('wf_unlocked_until') || '0');
  if (until > Date.now()) {
    document.getElementById('pin-overlay').style.display = 'none';
    return;
  }
  // Wire up number buttons
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

// ─── Init ─────────────────────────────────────────────
function init() {
  initPin();
  buildSun();
  startClock();
  fetchWeather();
  setInterval(fetchWeather, REFRESH_MS);
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
  const now = new Date();
  const h   = String(now.getHours()).padStart(2, '0');
  const m   = String(now.getMinutes()).padStart(2, '0');
  $clock.textContent   = `${h}:${m}`;
  $dayName.textContent = DAYS_DE[now.getDay()];
}

// ─── Weather fetch ────────────────────────────────────
async function fetchWeather() {
  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const c    = data.current;
    updateUI(c.temperature_2m, c.weathercode, c.windspeed_10m);
  } catch (err) {
    console.warn('Weather fetch failed:', err.message);
    // Keep previous state — no UI disruption on transient errors
  }
}

// ─── Update UI ────────────────────────────────────────
function updateUI(tempRaw, weatherCode, windSpeed) {
  const temp   = Math.round(tempRaw);
  const outfit = determineOutfit(tempRaw, weatherCode, new Date());

  $temp.textContent = `${temp}°`;
  setWeatherEmoji(resolveEmojiKey(outfit, weatherCode, windSpeed));

  // outfitSrc may differ from outfit when a daily _2 variant is active
  const outfitSrc = resolveOutfitSrc(outfit);

  // Re-render scene + characters when weather state OR daily variant changes
  const sceneChanged =
    outfitSrc !== currentOutfit ||
    weatherCode !== currentCode ||
    (windSpeed > 30) !== (currentWind > 30);

  if (sceneChanged) {
    currentOutfit = outfitSrc; // track effective src so variant flips are detected
    currentCode   = weatherCode;
    currentWind   = windSpeed;

    $lio.src  = `images/Lio_${outfitSrc}.png`;
    $mika.src = `images/Mika_${outfitSrc}.png`;
    $lio.style.visibility  = 'visible';
    $mika.style.visibility = 'visible';

    const scene = getScene(outfit, weatherCode, windSpeed);
    document.body.className = scene;
    renderParticles(scene);
  }
}

// ─── Outfit logic (priority order) ───────────────────
function determineOutfit(temp, code, now) {
  const day  = now.getDay();
  const hour = now.getHours();

  const isWeekendMorning = (day === 0 || day === 6) && hour < 12;
  const isRainy          = RAINY_CODES.has(code) || THUNDER_CODES.has(code);

  if (isWeekendMorning)    return 'Weekend';
  if (isRainy && temp > 3) return 'Rainy';
  if (temp <= 3)           return 'Winter_Cold';
  if (temp <= 10)          return 'Spring_Fall_Cold';
  if (temp <= 16)          return 'Spring_Fall_Mild';
  if (temp <= 20)          return 'Spring_Fall_Warm';
  if (temp <= 25)          return 'Summer_Warm';
  return 'Summer_Hot';
}

// ─── Particle renderer ────────────────────────────────
function renderParticles(scene) {
  $rainWrap.innerHTML  = '';
  $leafWrap.innerHTML  = '';
  $petalWrap.innerHTML = '';
  $snowWrap.innerHTML  = '';
  $confWrap.innerHTML  = '';

  // ── Rain (normal) ──
  if (scene === 'scene-rainy') {
    spawnRain(65);
    spawnRipples(5);
  }

  // ── Thunderstorm: heavier rain ──
  if (scene === 'scene-thunderstorm') {
    spawnRain(100);
    spawnRipples(8);
  }

  // ── Fall leaves ──
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

  // ── Windy: leaves blown horizontally ──
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

  // ── Spring petals ──
  if (scene === 'scene-spring') {
    for (let i = 0; i < 30; i++) {
      const p = document.createElement('div');
      p.className = 'petal';
      const drift = (Math.random() - 0.5) * 180;
      p.style.setProperty('--drift-x', `${drift}px`);
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

  // ── Winter snowflakes + sparkles ──
  if (scene === 'scene-winter') {
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

  // ── Weekend confetti + stars ──
  if (scene === 'scene-weekend') {
    for (let i = 0; i < 58; i++) {
      const c     = document.createElement('div');
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

  // scene-foggy, scene-cloudy, scene-sunny: purely CSS-driven, no JS particles needed
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

// ─── Helpers ──────────────────────────────────────────
function rand(min, max) { return Math.random() * (max - min) + min; }
function pick(arr)      { return arr[Math.floor(Math.random() * arr.length)]; }

// ─── Boot ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
