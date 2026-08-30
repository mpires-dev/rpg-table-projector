import { Vision } from './vision.js';
import { Roster, FACTIONS } from './roster.js';
import { Viewport } from './viewport.js';
import { Simulation } from './simulation.js';
import { drawScene, drawCalibrationPoints } from './overlay.js';
import { drawProjectorScene } from './projectorScene.js';
import { Board } from './board.js';
import { Bus } from './bus.js';
import { computeHomography } from './homography.js';
import { saveHomography, clearHomography, loadHomography } from './calibration.js';
import { findThreats, unitSize, DEFAULT_RULES } from './rules.js';

const SETTINGS_KEY = 'rpg-ar:settings:v1';

const DEFAULT_SETTINGS = {
  procWidth: 480,
  smoothing: 0.4,
  threatRange: DEFAULT_RULES.threatRange,
  moveRadius: DEFAULT_RULES.moveRadius,
  showMoveRadius: true,
  showMarkerOutline: false,
  showGrid: true,
  dictionary: 'ARUCO_MIP_36h12',
  debugSplit: false,
};

const el = {
  stage: document.getElementById('stage'),
  video: document.getElementById('video'),
  canvas: document.getElementById('overlay'),
  preview: document.getElementById('preview'),
  previewPane: document.getElementById('previewPane'),
  splitBtn: document.getElementById('splitBtn'),
  splitCheck: document.getElementById('splitCheck'),
  intro: document.getElementById('intro'),
  introHint: document.getElementById('introHint'),
  startBtn: document.getElementById('startBtn'),
  simBtn: document.getElementById('simBtn'),
  topbar: document.getElementById('topbar'),
  toolbar: document.getElementById('toolbar'),
  statusDot: document.getElementById('statusDot'),
  statusText: document.getElementById('statusText'),
  chips: document.getElementById('chips'),
  metrics: document.getElementById('metrics'),
  sheet: document.getElementById('sheet'),
  closeSheet: document.getElementById('closeSheet'),
  rosterList: document.getElementById('rosterList'),
  addEntry: document.getElementById('addEntry'),
  resetRoster: document.getElementById('resetRoster'),
  cameraBtn: document.getElementById('cameraBtn'),
  torchBtn: document.getElementById('torchBtn'),
  simToggle: document.getElementById('simToggle'),
  projDot: document.getElementById('projDot'),
  projStatus: document.getElementById('projStatus'),
  openProjector: document.getElementById('openProjector'),
  calibBtn: document.getElementById('calibBtn'),
  clearCalib: document.getElementById('clearCalib'),
  calibStep: document.getElementById('calibStep'),
};

const ctx = el.canvas.getContext('2d');
const previewCtx = el.preview.getContext('2d');
const settings = loadSettings();
const roster = new Roster();
const board = new Board();
const vision = new Vision(el.video, {
  detector: {
    dictionaryName: settings.dictionary,
    procWidth: settings.procWidth,
    maxHammingDistance: settings.maxHamming,
  },
  tracker: { smoothing: settings.smoothing },
});
const camera = vision.camera;
const simulation = new Simulation(roster);
const view = new Viewport();
const previewView = new Viewport();

const bus = new Bus();

const state = {
  simulating: false,
  torchOn: false,
  tracks: [],
  wasRunning: false,
  fps: 0,
  detectMs: 0,
  lastFrame: 0,
  chipsKey: '',
  lastPublish: 0,
  projector: { lastSeen: -Infinity, connected: false, aspect: 9 / 16 },
  matrix: loadHomography(),
  calib: { active: false, targets: [], points: [] },
};

/* ------------------------------------------------------------------ loop */

function loop(now) {
  requestAnimationFrame(loop);

  if (state.lastFrame) {
    const delta = now - state.lastFrame;
    if (delta > 0) state.fps += (1000 / delta - state.fps) * 0.1;
  }
  state.lastFrame = now;

  view.measure(el.canvas, el.video, camera.isRunning && camera.mirrored);

  if (state.simulating) {
    state.tracks = simulation.getTracks(now);
  } else if (camera.isRunning) {
    state.tracks = vision.update(now);
  } else {
    state.tracks = [];
  }

  const unit = unitSize(state.tracks);
  const threats = findThreats(state.tracks, roster, unit, {
    threatRange: settings.threatRange,
  });

  ctx.clearRect(0, 0, view.width, view.height);
  drawScene(ctx, {
    tracks: state.tracks,
    roster,
    view,
    threats,
    unit,
    time: now,
    settings: {
      ...settings,
      drawGrid: settings.showGrid && state.simulating && !camera.isRunning,
    },
  });

  if (state.calib.active) {
    drawCalibrationPoints(ctx, view, state.calib.points, state.calib.points.length);
  }

  if (settings.debugSplit) drawPreview(now);

  publish(now);
  updateHud(threats);
}

/**
 * Preview de debug: roda exatamente a mesma função da janela de projeção, com a
 * mesma matriz de calibração. Se o preview e a projeção discordarem, o bug está
 * no canal — não no desenho.
 */
function drawPreview(now) {
  const box = previewView.measureBox(el.preview, state.projector.aspect);
  drawProjectorScene(previewCtx, {
    tracks: state.tracks,
    roster,
    board,
    view: previewView,
    matrix: state.matrix,
    settings,
    time: now,
    box,
  });
}

/* ---------------------------------------------- canal com a projeção */

const PUBLISH_INTERVAL_MS = 33; // ~30 Hz é mais que suficiente para o olho

function publish(now) {
  if (now - state.lastPublish < PUBLISH_INTERVAL_MS) return;
  state.lastPublish = now;

  // Só os cantos viajam: a projeção passa cada um pela homografia e recalcula
  // centro, ângulo e tamanho do outro lado.
  bus.send('tracks', {
    tracks: state.tracks.map((track) => ({
      id: track.id,
      corners: track.corners.map((c) => ({ x: c.x, y: c.y })),
      visible: track.visible,
      confidence: track.confidence,
    })),
  });

  const connected = now - state.projector.lastSeen < 2500;
  if (connected !== state.projector.connected) {
    state.projector.connected = connected;
    renderProjectorPanel();
  }
}

function markProjectorAlive(payload) {
  state.projector.lastSeen = performance.now();
  // O preview só é honesto se respeitar o formato da tela onde a projeção roda.
  if (payload?.aspect > 0) state.projector.aspect = payload.aspect;
}

bus.on('projector:ready', (payload) => {
  markProjectorAlive(payload);
  publishSettings();
  state.projector.connected = true;
  renderProjectorPanel();
});
bus.on('projector:alive', markProjectorAlive);
bus.on('board', (payload) => board.fromJSON(payload?.terrain));

bus.on('calib:targets', (payload) => {
  state.calib.targets = payload?.targets || [];
  state.calib.points = [];
  state.calib.active = state.calib.targets.length === 4;
  renderProjectorPanel();
});

function publishSettings() {
  bus.send('settings', {
    threatRange: settings.threatRange,
    moveRadius: settings.moveRadius,
    showMoveRadius: settings.showMoveRadius,
    showMarkerOutline: settings.showMarkerOutline,
    showGrid: settings.showGrid,
  });
}

bus.send('control:hello', {});

/* ------------------------------------------------------------------- hud */

function updateHud(threats) {
  const visible = state.tracks.filter((t) => t.visible);
  const key = visible.map((t) => t.id).join(',');
  if (key !== state.chipsKey) {
    state.chipsKey = key;
    el.chips.innerHTML = '';
    for (const track of visible.slice(0, 5)) {
      const entry = roster.get(track.id);
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.style.color = entry.color;
      chip.textContent = entry.name;
      el.chips.appendChild(chip);
    }
  }

  const parts = [`${state.fps.toFixed(0)} fps`];
  if (!state.simulating) parts.push(`${vision.detectMs.toFixed(0)} ms`);
  parts.push(`${visible.length} peça${visible.length === 1 ? '' : 's'}`);
  if (threats.length) parts.push(`⚔ ${threats.length}`);
  el.metrics.textContent = parts.join(' · ');
}

function setStatus() {
  const live = camera.isRunning;
  el.statusDot.className = `dot ${state.simulating ? 'sim' : live ? 'live' : ''}`;
  el.statusText.textContent = state.simulating
    ? 'simulação'
    : live
      ? 'ao vivo'
      : 'parado';
  el.cameraBtn.classList.toggle('active', live);
  el.simToggle.classList.toggle('active', state.simulating);
  el.video.classList.toggle('mirrored', live && camera.mirrored);
  el.torchBtn.disabled = !camera.supportsTorch;
  el.torchBtn.classList.toggle('active', state.torchOn);
}

function showApp() {
  el.intro.hidden = true;
  el.topbar.hidden = false;
  el.toolbar.hidden = false;
}

function reportError(error) {
  const message = describeError(error);
  el.introHint.textContent = message;
  el.statusText.textContent = 'erro';
  console.error(error);
}

function describeError(error) {
  const name = error?.name || '';
  if (name === 'NotAllowedError') {
    return 'Permissão de câmera negada. Libere nas configurações do site e recarregue.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'Nenhuma câmera compatível encontrada neste aparelho.';
  }
  if (name === 'NotReadableError') {
    return 'A câmera está ocupada por outro app. Feche os outros e tente de novo.';
  }
  if (!window.isSecureContext) {
    return 'A câmera só funciona em https:// (ou localhost). Abra pelo endereço https da rede.';
  }
  return error?.message || 'Não foi possível abrir a câmera.';
}

/* --------------------------------------------------------------- ações */

async function startCamera() {
  try {
    el.introHint.textContent = '';
    await camera.start();
    vision.reset();
    showApp();
  } catch (error) {
    reportError(error);
    return;
  }
  setStatus();
}

function stopCamera() {
  camera.stop();
  state.torchOn = false;
  vision.reset();
  setStatus();
}

function toggleSimulation(force) {
  state.simulating = force ?? !state.simulating;
  if (state.simulating) {
    simulation.reset(view.visibleBounds());
    showApp();
  }
  setStatus();
}

el.startBtn.addEventListener('click', startCamera);
el.simBtn.addEventListener('click', () => toggleSimulation(true));

el.toolbar.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  const action = button.dataset.action;

  if (action === 'camera') {
    camera.isRunning ? stopCamera() : await startCamera();
  } else if (action === 'flip') {
    if (!camera.isRunning) return startCamera();
    try {
      await camera.flip();
      vision.reset();
      state.torchOn = false;
      setStatus();
    } catch (error) {
      reportError(error);
    }
  } else if (action === 'torch') {
    const applied = await camera.setTorch(!state.torchOn);
    if (applied) state.torchOn = !state.torchOn;
    setStatus();
  } else if (action === 'split') {
    setSplit(!settings.debugSplit);
  } else if (action === 'sim') {
    toggleSimulation();
  } else if (action === 'panel') {
    openSheet();
  }
});

/* ------------------------------------------------- arrastar na simulação */

el.canvas.addEventListener('pointerdown', (event) => {
  if (state.calib.active) {
    collectCalibrationPoint(event);
    return;
  }
  if (!state.simulating) return;
  const { nx, ny } = view.toNormalized(event.clientX, event.clientY, el.canvas);
  if (simulation.startDrag(nx, ny)) {
    el.canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  }
});

el.canvas.addEventListener('pointermove', (event) => {
  if (!state.simulating || !simulation.dragging) return;
  const { nx, ny } = view.toNormalized(event.clientX, event.clientY, el.canvas);
  simulation.drag(nx, ny);
  event.preventDefault();
});

for (const type of ['pointerup', 'pointercancel']) {
  el.canvas.addEventListener(type, () => simulation.endDrag());
}

/* ------------------------------------------------------------- painel */

function openSheet(tab = 'roster') {
  el.sheet.hidden = false;
  selectTab(tab);
  renderRoster();
  renderProjectorPanel();
}

function selectTab(name) {
  for (const button of el.sheet.querySelectorAll('.tab')) {
    button.classList.toggle('active', button.dataset.tab === name);
  }
  for (const panel of el.sheet.querySelectorAll('.tab-body')) {
    panel.hidden = panel.dataset.panel !== name;
  }
}

el.sheet.addEventListener('click', (event) => {
  const tab = event.target.closest('.tab');
  if (tab) selectTab(tab.dataset.tab);
});

el.closeSheet.addEventListener('click', () => {
  el.sheet.hidden = true;
});

function renderRoster() {
  el.rosterList.innerHTML = '';
  for (const entry of roster.list()) {
    el.rosterList.appendChild(buildEntryRow(entry));
  }
}

function buildEntryRow(entry) {
  const row = document.createElement('div');
  row.className = 'entry';

  const badge = document.createElement('div');
  badge.className = 'id-badge';
  badge.style.background = entry.color;
  badge.textContent = entry.id;

  const name = document.createElement('input');
  name.type = 'text';
  name.value = entry.name;
  name.placeholder = 'Nome';
  name.addEventListener('change', () => {
    roster.upsert({ ...entry, name: name.value });
    bus.send('roster', {});
  });

  const role = document.createElement('input');
  role.type = 'text';
  role.value = entry.role;
  role.placeholder = 'Classe';
  role.addEventListener('change', () => {
    roster.upsert({ ...entry, role: role.value });
    bus.send('roster', {});
  });

  const remove = document.createElement('button');
  remove.className = 'remove';
  remove.textContent = '✕';
  remove.addEventListener('click', () => {
    roster.remove(entry.id);
    bus.send('roster', {});
    renderRoster();
  });

  const second = document.createElement('div');
  second.className = 'second-row';

  const faction = document.createElement('select');
  for (const [value, meta] of Object.entries(FACTIONS)) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = meta.label;
    option.selected = value === entry.faction;
    faction.appendChild(option);
  }
  faction.addEventListener('change', () => {
    roster.upsert({ ...entry, faction: faction.value });
    bus.send('roster', {});
  });

  const color = document.createElement('input');
  color.type = 'color';
  color.value = entry.color;
  color.addEventListener('change', () => {
    roster.upsert({ ...entry, color: color.value });
    badge.style.background = color.value;
    bus.send('roster', {});
  });

  const idInput = document.createElement('input');
  idInput.type = 'number';
  idInput.min = '0';
  idInput.value = entry.id;
  idInput.style.maxWidth = '80px';
  idInput.addEventListener('change', () => {
    const next = Number(idInput.value);
    if (!Number.isInteger(next) || next < 0 || next === entry.id) return;
    roster.remove(entry.id);
    roster.upsert({ ...entry, id: next });
    renderRoster();
  });

  second.append(faction, idInput, color);
  row.append(badge, name, role, remove, second);
  return row;
}

el.addEntry.addEventListener('click', () => {
  const used = new Set(roster.list().map((e) => e.id));
  let id = 0;
  while (used.has(id)) id++;
  roster.upsert({ id, name: `Peça ${id}`, role: 'Sem classe', faction: 'hero', color: '#6ea8ff' });
  bus.send('roster', {});
  renderRoster();
});

el.resetRoster.addEventListener('click', () => {
  roster.resetToDefault();
  bus.send('roster', {});
  renderRoster();
});


/* ------------------------------------------------------- calibração */

function startCalibration() {
  if (state.calib.active) {
    cancelCalibration();
    return;
  }
  state.calib = { active: false, targets: [], points: [] };
  // A projeção responde com os alvos que desenhou; só então entramos no modo.
  bus.send('calib:start', {});
  renderProjectorPanel();
}

function cancelCalibration() {
  state.calib = { active: false, targets: [], points: [] };
  bus.send('calib:stop', {});
  renderProjectorPanel();
}

function collectCalibrationPoint(event) {
  const { nx, ny } = view.toNormalized(event.clientX, event.clientY, el.canvas);
  state.calib.points.push({ x: nx, y: ny });
  event.preventDefault();

  if (state.calib.points.length < state.calib.targets.length) {
    bus.send('calib:progress', { index: state.calib.points.length });
    renderProjectorPanel();
    return;
  }

  const matrix = computeHomography(state.calib.points, state.calib.targets);
  if (!matrix) {
    // Acontece quando os 4 cliques caem quase em linha ou muito juntos.
    state.calib.points = [];
    bus.send('calib:progress', { index: 0 });
    el.calibStep.textContent =
      'Os 4 pontos ficaram alinhados demais para fechar a conta. Recomeçando: clique nos cantos bem afastados entre si.';
    return;
  }

  saveHomography(matrix);
  state.matrix = matrix;
  bus.send('homography', { matrix });
  cancelCalibration();
}

function renderProjectorPanel() {
  const connected = state.projector.connected;
  el.projDot.className = `dot ${state.calib.active ? 'sim' : connected ? 'live' : ''}`;
  el.projStatus.textContent = state.calib.active
    ? 'calibrando…'
    : connected
      ? 'projeção conectada'
      : 'nenhuma janela de projeção aberta';

  el.calibBtn.textContent = state.calib.active ? 'Cancelar calibração' : 'Calibrar';
  el.calibBtn.disabled = !connected && !state.calib.active;

  el.calibStep.hidden = !state.calib.active;
  if (state.calib.active) {
    const index = state.calib.points.length;
    const target = state.calib.targets[index];
    el.calibStep.textContent = target
      ? `Alvo ${index + 1} de 4 (${target.label}): toque na imagem exatamente onde ele aparece na mesa.`
      : 'Calculando…';
  }

  el.clearCalib.textContent = loadHomography() ? 'Limpar calibração' : 'Sem calibração';
  el.clearCalib.disabled = !loadHomography();
}

function setSplit(enabled) {
  settings.debugSplit = enabled;
  el.stage.classList.toggle('split', enabled);
  el.previewPane.hidden = !enabled;
  el.splitBtn.classList.toggle('active', enabled);
  el.splitCheck.checked = enabled;
  saveSettings();
}

el.splitCheck.addEventListener('change', () => setSplit(el.splitCheck.checked));

el.openProjector.addEventListener('click', () => {
  window.open('/projector.html', 'projector');
});

el.calibBtn.addEventListener('click', startCalibration);

el.clearCalib.addEventListener('click', () => {
  clearHomography();
  state.matrix = null;
  bus.send('homography', { matrix: null });
  renderProjectorPanel();
});

/* ----------------------------------------------------------- ajustes */

function bindRange(id, valueId, key, { scale = 1, format = (v) => v.toFixed(1) } = {}) {
  const input = document.getElementById(id);
  const label = document.getElementById(valueId);
  input.value = String(settings[key] * scale);
  if (label) label.textContent = format(settings[key]);
  input.addEventListener('input', () => {
    settings[key] = Number(input.value) / scale;
    if (label) label.textContent = format(settings[key]);
    if (key === 'smoothing') vision.configure({ tracker: { smoothing: settings[key] } });
    if (key === 'procWidth') vision.configure({ detector: { procWidth: settings[key] } });
    saveSettings();
  });
}

function bindCheck(id, key) {
  const input = document.getElementById(id);
  input.checked = Boolean(settings[key]);
  input.addEventListener('change', () => {
    settings[key] = input.checked;
    saveSettings();
  });
}

bindRange('procWidth', 'procValue', 'procWidth', { format: (v) => `${v}px` });
bindRange('smoothing', 'smoothValue', 'smoothing', {
  scale: 100,
  format: (v) => v.toFixed(2),
});
bindRange('threatRange', 'threatValue', 'threatRange', {
  scale: 10,
  format: (v) => `${v.toFixed(1)} un`,
});
bindRange('moveRadius', 'moveValue', 'moveRadius', {
  scale: 10,
  format: (v) => `${v.toFixed(1)} un`,
});
bindCheck('showMoveRadius', 'showMoveRadius');
bindCheck('showMarkerOutline', 'showMarkerOutline');
bindCheck('showGrid', 'showGrid');

const dictionarySelect = document.getElementById('dictionary');
dictionarySelect.value = settings.dictionary;
dictionarySelect.addEventListener('change', () => {
  settings.dictionary = dictionarySelect.value;
  vision.configure({ detector: { dictionaryName: settings.dictionary } });
  vision.reset();
  saveSettings();
});

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    // ignora storage indisponível
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings() {
  publishSettings();
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignora
  }
}

/* ------------------------------------------------------------- ciclo */

// Sair do app e voltar mata o stream em muitos aparelhos: religa sozinho.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && camera.isRunning) {
    stopCamera();
    state.wasRunning = true;
  } else if (!document.hidden && state.wasRunning) {
    state.wasRunning = false;
    startCamera();
  }
});

if (!window.isSecureContext) {
  el.introHint.textContent =
    'Página aberta sem https. A câmera só liga em https:// ou localhost.';
}

setStatus();
setSplit(settings.debugSplit);
renderProjectorPanel();
requestAnimationFrame(loop);
