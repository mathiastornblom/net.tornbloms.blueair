'use strict';

// ── Air quality thresholds ────────────────────────────────────────────────────

const PM25_LEVELS = [
  { max: 12,       label: 'Good',           color: '#22c55e' },
  { max: 35,       label: 'Moderate',       color: '#eab308' },
  { max: 55,       label: 'Unhealthy',      color: '#f97316' },
  { max: Infinity, label: 'Very Unhealthy', color: '#ef4444' },
];

function getPM25Level(value) {
  return PM25_LEVELS.find((l) => value <= l.max) ?? PM25_LEVELS[PM25_LEVELS.length - 1];
}

// ── Metric display config ─────────────────────────────────────────────────────

const SECONDARY_METRICS = [
  { cap: 'measure_pm1',         label: 'PM1',      unit: '' },
  { cap: 'measure_pm10',        label: 'PM10',     unit: '' },
  { cap: 'measure_tvoc',        label: 'tVOC',     unit: '' },
  { cap: 'measure_humidity',    label: 'Humidity', unit: '%' },
  { cap: 'measure_temperature', label: 'Temp',     unit: '°' },
  { cap: 'fanspeed',            label: 'Fan',      unit: '%' },
];

function formatValue(cap, value) {
  if (value === null || value === undefined) return '—';
  if (cap === 'measure_temperature') return value.toFixed(1);
  return String(Math.round(value));
}

// ── State ─────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'blueair_aq_device';
let selectedDeviceId = null;
let refreshTimer = null;

// ── DOM helpers ───────────────────────────────────────────────────────────────

function show(id) { document.getElementById(id).hidden = false; }
function hide(id) { document.getElementById(id).hidden = true; }

// ── Widget entry point ────────────────────────────────────────────────────────

async function onHomeyReady(Homey) {
  const settings = Homey.getSettings();
  const refreshMs = Math.max(5, Number(settings.refreshSeconds) || 15) * 1000;

  let devices;
  try {
    devices = await Homey.api('GET', '/devices');
  } catch {
    hide('state-loading');
    show('state-error');
    Homey.ready({ height: document.body.scrollHeight });
    return;
  }

  hide('state-loading');

  if (!devices || devices.length === 0) {
    show('state-no-devices');
    Homey.ready({ height: document.body.scrollHeight });
    return;
  }

  // ── Populate device selector ──
  const select = document.getElementById('device-select');
  for (const d of devices) {
    const opt = document.createElement('option');
    opt.value = d.id;
    opt.textContent = d.name;
    select.appendChild(opt);
  }

  // Restore previously selected device from localStorage
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && devices.find((d) => d.id === stored)) {
    selectedDeviceId = stored;
  } else {
    selectedDeviceId = devices[0].id;
  }
  select.value = selectedDeviceId;

  select.addEventListener('change', () => {
    selectedDeviceId = select.value;
    localStorage.setItem(STORAGE_KEY, selectedDeviceId);
    clearTimeout(refreshTimer);
    fetchAndRender(Homey, refreshMs);
  });

  // ── Realtime updates pushed from the app ──
  // The app can call `this.homey.api.realtime('deviceUpdate', { deviceId, values })`
  // in device polling to deliver instant updates without waiting for the interval.
  Homey.on('deviceUpdate', ({ deviceId, values }) => {
    if (deviceId === selectedDeviceId) {
      renderValues(values);
      Homey.setHeight(document.body.scrollHeight);
    }
  });

  await fetchAndRender(Homey, refreshMs);
  Homey.ready({ height: document.body.scrollHeight });
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchAndRender(Homey, refreshMs) {
  try {
    const values = await Homey.api('GET', `/device/${selectedDeviceId}/values`);
    renderValues(values);
    Homey.setHeight(document.body.scrollHeight);
  } catch {
    // Keep showing the last rendered values; silently retry next interval
  }
  refreshTimer = setTimeout(() => fetchAndRender(Homey, refreshMs), refreshMs);
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderValues(values) {
  show('main');

  // PM2.5 — primary metric
  const pm25 = values['measure_pm25'];
  const pm25El = document.getElementById('pm25-value');
  const pm25Badge = document.getElementById('pm25-badge');

  if (pm25 !== null && pm25 !== undefined) {
    const level = getPM25Level(pm25);
    pm25El.textContent = Math.round(pm25);
    pm25El.style.color = level.color;
    pm25Badge.textContent = level.label;
    pm25Badge.style.backgroundColor = level.color;
    pm25Badge.hidden = false;
  } else {
    pm25El.textContent = '—';
    pm25El.style.color = '';
    pm25Badge.hidden = true;
  }

  // Secondary metrics — only render those available on this device
  const grid = document.getElementById('metrics-grid');
  grid.innerHTML = '';

  for (const { cap, label, unit } of SECONDARY_METRICS) {
    if (!(cap in values)) continue;
    const div = document.createElement('div');
    div.className = 'metric';
    div.innerHTML =
      `<div class="metric-value">${formatValue(cap, values[cap])}${unit}</div>` +
      `<div class="metric-label">${label}</div>`;
    grid.appendChild(div);
  }

  // Status bar
  const filterEl = document.getElementById('filter-label');
  const wifiEl   = document.getElementById('wifi-label');

  if ('filter_status' in values && values['filter_status'] !== null) {
    filterEl.textContent = `Filter: ${values['filter_status']}`;
  } else {
    filterEl.textContent = '';
  }

  if ('wifi_status' in values && values['wifi_status'] !== null) {
    const online = values['wifi_status'];
    const color  = online ? '#22c55e' : '#ef4444';
    const label  = online ? 'Online' : 'Offline';
    wifiEl.innerHTML = `<span class="dot" style="background:${color}"></span>${label}`;
  } else {
    wifiEl.textContent = '';
  }
}
