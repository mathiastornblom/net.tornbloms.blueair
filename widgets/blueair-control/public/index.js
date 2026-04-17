'use strict';

// ── State ─────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'blueair_ctrl_device';
let selectedDeviceId = null;
let Homey = null; // set in onHomeyReady

// ── DOM helpers ───────────────────────────────────────────────────────────────

function show(id) { document.getElementById(id).hidden = false; }
function hide(id) { document.getElementById(id).hidden = true; }

// ── Widget entry point ────────────────────────────────────────────────────────

async function onHomeyReady(homey) {
  Homey = homey;

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

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && devices.find((d) => d.id === stored)) {
    selectedDeviceId = stored;
  } else {
    selectedDeviceId = devices[0].id;
  }
  select.value = selectedDeviceId;

  select.addEventListener('change', async () => {
    selectedDeviceId = select.value;
    localStorage.setItem(STORAGE_KEY, selectedDeviceId);
    await loadDevice();
  });

  // ── Realtime updates from the app ──
  // If the app emits 'deviceUpdate' (e.g., from its poll loop), reflect the
  // new state immediately without waiting for the next user interaction.
  Homey.on('deviceUpdate', ({ deviceId, values }) => {
    if (deviceId === selectedDeviceId) {
      applyState(values);
      Homey.setHeight(document.body.scrollHeight);
    }
  });

  await loadDevice();
  Homey.ready({ height: document.body.scrollHeight });
}

// ── Load device state and wire up controls ────────────────────────────────────

async function loadDevice() {
  let result;
  try {
    result = await Homey.api('GET', `/device/${selectedDeviceId}/state`);
  } catch {
    show('state-error');
    return;
  }

  const { capabilities, state } = result;

  // Show/hide rows based on what the device supports
  const TOGGLE_CAPS = ['automode', 'nightmode', 'standby', 'child_lock'];
  const showCap = (cap) => capabilities.includes(cap);

  // Fan speed slider
  const fanRow = document.getElementById('row-fanspeed');
  if (showCap('fanspeed')) {
    fanRow.hidden = false;
    setupFanSlider(state['fanspeed']);
  } else {
    fanRow.hidden = true;
  }

  // Toggle rows
  for (const cap of TOGGLE_CAPS) {
    const row = document.getElementById(`row-${cap}`);
    if (showCap(cap)) {
      row.hidden = false;
    } else {
      row.hidden = true;
    }
  }

  applyState(state);
  show('main');
  Homey.setHeight(document.body.scrollHeight);
}

// ── Apply device state to UI (without re-wiring listeners) ───────────────────

function applyState(state) {
  if ('fanspeed' in state && state['fanspeed'] !== null) {
    const slider = document.getElementById('slider-fanspeed');
    const valueEl = document.getElementById('value-fanspeed');
    const v = Math.round(state['fanspeed']);
    slider.value = v;
    valueEl.textContent = `${v}%`;
  }

  for (const cap of ['automode', 'nightmode', 'standby', 'child_lock']) {
    if (cap in state && state[cap] !== null) {
      document.getElementById(`toggle-${cap}`).checked = Boolean(state[cap]);
    }
  }
}

// ── Fan speed slider ──────────────────────────────────────────────────────────

let fanDebounceTimer = null;

function setupFanSlider(initialValue) {
  const slider  = document.getElementById('slider-fanspeed');
  const valueEl = document.getElementById('value-fanspeed');

  if (initialValue !== null) {
    slider.value = Math.round(initialValue);
    valueEl.textContent = `${Math.round(initialValue)}%`;
  }

  // Remove any previous listener by cloning
  const fresh = slider.cloneNode(true);
  slider.replaceWith(fresh);

  fresh.addEventListener('input', () => {
    valueEl.textContent = `${fresh.value}%`;
  });

  fresh.addEventListener('change', () => {
    clearTimeout(fanDebounceTimer);
    fanDebounceTimer = setTimeout(() => {
      sendCapability('fanspeed', Number(fresh.value));
    }, 300);
  });
}

// ── Toggle setup (called once on first load, survives applyState) ─────────────

function initToggles() {
  for (const cap of ['automode', 'nightmode', 'standby', 'child_lock']) {
    const checkbox = document.getElementById(`toggle-${cap}`);
    if (!checkbox) continue;

    checkbox.addEventListener('change', async () => {
      const label = checkbox.closest('.toggle');
      label.classList.add('sending');
      checkbox.disabled = true;

      const success = await sendCapability(cap, checkbox.checked);
      if (!success) {
        // Revert optimistic UI update
        checkbox.checked = !checkbox.checked;
      }

      checkbox.disabled = false;
      label.classList.remove('sending');
    });
  }
}

// ── API call ──────────────────────────────────────────────────────────────────

async function sendCapability(cap, value) {
  try {
    await Homey.api('POST', `/device/${selectedDeviceId}/capability/${cap}`, { value });
    return true;
  } catch {
    return false;
  }
}

// ── Init toggles once on script load (before onHomeyReady) ───────────────────

// Toggle listeners are attached immediately since the DOM is already parsed
// (script is at the end of <body>). They survive device switches because
// applyState only sets .checked, not the listener.
document.addEventListener('DOMContentLoaded', initToggles);
