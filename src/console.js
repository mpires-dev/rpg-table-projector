import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/fraunces/full.css';

import { Vision } from './vision.js';
import { Roster, FACTIONS } from './roster.js';
import { Board, TERRAINS, boardLayout, cellAt, cellCenter, cellLabel } from './board.js';
import { Viewport } from './viewport.js';
import { Bus } from './bus.js';
import { EventLog } from './events.js';
import { Simulation } from './simulation.js';
import { drawProjectorScene } from './projectorScene.js';
import { computeHomography, IDENTITY } from './homography.js';
import { loadHomography, saveHomography, clearHomography } from './calibration.js';
import { icon, hydrateIcons } from './icons.js';

const SETTINGS_KEY = 'rpg-ar:console:v1';

const DEFAULT_SETTINGS = {
  onlyKnown: true, // filtro mais eficaz contra "apareceu peça que eu não mostrei"
  maxHamming: 3,
  confirmFrames: 3,
  procWidth: 480,
  threatCells: 1,
  moveRadius: 2, // em células
  showMoveRadius: false, // ligado, quatro círculos de 2 casas cobrem o mapa inteiro
};

const el = {};
for (const id of [
  'video', 'overlay', 'boardPreview', 'stage', 'diag', 'visionMode', 'cameraHint',
  'mFps', 'mMs', 'mPieces',
  'cameraBtn', 'cameraState', 'projectorBtn', 'projectorState',
  'calibBtn', 'calibState', 'calibBanner',
  'flipBtn', 'torchBtn', 'simBtn', 'pieceList', 'pieceCount', 'log', 'clearLog',
  'rosterList', 'addPiece', 'resetRoster', 'palette', 'clearBoard', 'clearCalib',
  'onlyKnown', 'hamming', 'hammingValue', 'confirmFrames', 'confirmValue',
  'procWidth', 'procValue', 'threatCells', 'threatValue', 'showMoveRadius',
]) {
  el[id] = document.getElementById(id);
}

const settings = loadSettings();
const roster = new Roster();
const board = new Board();
const log = new EventLog();
const bus = new Bus();
const simulation = new Simulation(roster);

const vision = new Vision(el.video, {
  detector: {
    procWidth: settings.procWidth,
    maxHammingDistance: settings.maxHamming,
  },
  tracker: { confirmFrames: settings.confirmFrames },
});
const camera = vision.camera;

const cameraCtx = el.overlay.getContext('2d');
const boardCtx = el.boardPreview.getContext('2d');
const cameraView = new Viewport();
const boardView = new Viewport();

const state = {
  tracks: [],
  scene: null, // último resultado de drawProjectorScene
  matrix: loadHomography(),
  simulating: false,
  torchOn: false,
  terrain: 'wall',
  fps: 0,
  lastFrame: 0,
  lastPublish: 0,
  lastMetrics: 0,
  projector: { lastSeen: -Infinity, connected: false, aspect: 9 / 16 },
  calib: { active: false, targets: [], points: [] },
  pieceKey: null,
  logRevision: -1,
  wasRunning: false,
};

/* ------------------------------------------------------------------ loop */

function loop(now) {
  requestAnimationFrame(loop);

  if (state.lastFrame) {
    const delta = now - state.lastFrame;
    if (delta > 0) state.fps += (1000 / delta - state.fps) * 0.1;
  }
  state.lastFrame = now;

  state.tracks = state.simulating
    ? simulation.getTracks(now)
    : vision.update(now, settings.onlyKnown ? isKnownId : undefined);

  drawCameraPreview();
  drawBoardPreview(now);

  if (state.scene) {
    log.update({
      tracks: state.scene.projected,
      cells: state.scene.cells,
      threats: state.scene.threats,
      roster,
      board,
    });
  }

  publish(now);
  renderPieces();
  renderLog();

  // Texto de diagnóstico não precisa de 60 Hz — e escrever no DOM todo quadro
  // custa layout à toa.
  if (now - state.lastMetrics > 250) {
    state.lastMetrics = now;
    updateReadout();
  }
}

function isKnownId(id) {
  return !roster.get(id).unregistered;
}

/* --------------------------------------------------------- preview câmera */

/**
 * Overlay do visor: propositalmente cru — contorno, nome e nada mais. Aqui o que
 * importa é enxergar *o que a detecção viu*; o desenho bonito é o da projeção.
 */
function drawCameraPreview() {
  cameraView.measure(el.overlay, el.video, camera.isRunning && camera.mirrored);
  const ctx = cameraCtx;
  const scale = cameraView.dpr;
  ctx.clearRect(0, 0, cameraView.width, cameraView.height);

  if (state.simulating) return;

  for (const track of state.tracks) {
    const entry = roster.get(track.id);
    ctx.save();
    ctx.globalAlpha = track.confidence;
    ctx.strokeStyle = entry.color;
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    track.corners.forEach((c, index) => {
      const x = cameraView.toScreenX(c.x);
      const y = cameraView.toScreenY(c.y);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();

    const cx = cameraView.toScreenX(track.cx);
    const cy = cameraView.toScreenY(track.cy);
    const label = entry.name;
    ctx.font = `600 ${11 * scale}px 'Inter Variable', system-ui, sans-serif`;
    ctx.textAlign = 'center';
    const width = ctx.measureText(label).width + 10 * scale;
    const top = cy - cameraView.toScreenLength(track.size) * 0.75;
    ctx.fillStyle = 'rgba(22,21,15,0.72)';
    ctx.fillRect(cx - width / 2, top - 11 * scale, width, 16 * scale);
    ctx.fillStyle = entry.color;
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, top - 3 * scale);
    ctx.restore();
  }

  if (state.calib.active) drawCalibrationHints(ctx, scale);
}

function drawCalibrationHints(ctx, scale) {
  ctx.save();
  ctx.strokeStyle = '#5bd68c';
  ctx.lineWidth = 2 * scale;
  for (const point of state.calib.points) {
    const x = cameraView.toScreenX(point.x);
    const y = cameraView.toScreenY(point.y);
    ctx.beginPath();
    ctx.arc(x, y, 9 * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 14 * scale, y);
    ctx.lineTo(x + 14 * scale, y);
    ctx.moveTo(x, y - 14 * scale);
    ctx.lineTo(x, y + 14 * scale);
    ctx.stroke();
  }
  ctx.restore();
}

/* ------------------------------------------------------- preview tabuleiro */

function drawBoardPreview(now) {
  applyProjectorAspect();
  const box = boardView.measureBox(el.boardPreview, state.projector.aspect);
  state.scene = drawProjectorScene(boardCtx, {
    tracks: state.tracks,
    roster,
    board,
    view: boardView,
    // Na simulação as peças já nascem no espaço do tabuleiro: aplicar a
    // calibração aqui as jogaria para fora da mesa.
    matrix: state.simulating ? IDENTITY : state.matrix,
    settings,
    time: now,
    box,
  });
}

/**
 * Deixa o palco com a proporção da tela do projetor. Escrever no style a cada
 * quadro invalidaria layout à toa, então só escreve quando o valor muda.
 */
let appliedAspect = null;
function applyProjectorAspect() {
  const aspect = state.projector.aspect;
  if (aspect === appliedAspect) return;
  appliedAspect = aspect;
  el.stage.style.setProperty('--projector-aspect', String(1 / aspect));
}

/* ------------------------------------------------------------- publicação */

const PUBLISH_INTERVAL_MS = 33;

function publish(now) {
  if (now - state.lastPublish >= PUBLISH_INTERVAL_MS) {
    state.lastPublish = now;
    bus.send('tracks', {
      identity: state.simulating,
      tracks: state.tracks.map((track) => ({
        id: track.id,
        corners: track.corners.map((c) => ({ x: c.x, y: c.y })),
        visible: track.visible,
        confidence: track.confidence,
      })),
    });
  }

  const connected = now - state.projector.lastSeen < 2500;
  if (connected !== state.projector.connected) {
    state.projector.connected = connected;
    updateProjectorControl();
  }
}

function publishSettings() {
  bus.send('settings', {
    threatCells: settings.threatCells,
    moveRadius: settings.moveRadius,
    showMoveRadius: settings.showMoveRadius,
    showLabels: true,
  });
}

function publishBoard() {
  bus.send('board', { terrain: board.toJSON() });
}

bus.on('projector:ready', (payload) => {
  markProjectorAlive(payload);
  publishSettings();
  publishBoard();
  bus.send('homography', { matrix: state.matrix });
});
bus.on('projector:alive', markProjectorAlive);

function markProjectorAlive(payload) {
  state.projector.lastSeen = performance.now();
  if (payload?.aspect > 0) state.projector.aspect = payload.aspect;
}

bus.on('calib:targets', (payload) => {
  state.calib.targets = payload?.targets || [];
  state.calib.points = [];
  state.calib.active = state.calib.targets.length === 4;
  updateCalibrationControl();
});

bus.send('control:hello', {});

/* --------------------------------------------------------------- listas */

function emptyState(headline, detail) {
  const li = document.createElement('li');
  li.className = 'empty';
  const strong = document.createElement('b');
  strong.textContent = headline;
  const span = document.createElement('span');
  span.textContent = detail;
  li.append(strong, span);
  return li;
}

function renderPieces() {
  const cells = state.scene?.cells || new Map();
  const threatened = new Set();
  for (const threat of state.scene?.threats || []) {
    threatened.add(threat.a.id);
    threatened.add(threat.b.id);
  }

  // Redesenhar a lista a cada quadro seria desperdício: só refaz quando algo que
  // aparece nela realmente mudou.
  const key = state.tracks
    .map((t) => `${t.id}:${cellLabel(cells.get(t.id))}:${t.visible ? 1 : 0}:${threatened.has(t.id) ? 1 : 0}`)
    .join('|');
  if (key === state.pieceKey) return;
  state.pieceKey = key;

  el.pieceCount.textContent = String(state.tracks.length);
  el.pieceList.innerHTML = '';

  if (!state.tracks.length) {
    el.pieceList.appendChild(
      emptyState(
        'Nenhuma peça na mesa',
        state.simulating
          ? 'Arraste as peças no tabuleiro ao lado.'
          : 'Aponte a câmera para os marcadores, de cima.'
      )
    );
    return;
  }

  for (const track of state.tracks) {
    const entry = roster.get(track.id);
    const cell = cells.get(track.id);
    const terrain = cell ? TERRAINS[board.get(cell.row, cell.col)] : null;

    const li = document.createElement('li');
    li.className = 'piece';
    if (threatened.has(track.id)) li.classList.add('threatened');
    if (!track.visible) li.classList.add('occluded');

    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = entry.color;

    const info = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = entry.name;
    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = [
      entry.role,
      terrain && terrain.label !== 'Normal' ? terrain.label : null,
      !track.visible ? 'fora de vista' : null,
      threatened.has(track.id) ? 'ameaçada' : null,
    ]
      .filter(Boolean)
      .join(' · ');
    info.append(name, sub);

    const position = document.createElement('div');
    position.className = 'cell';
    position.textContent = cell ? cellLabel(cell) : '—';
    const caption = document.createElement('small');
    caption.textContent = cell ? 'casa' : 'fora';
    position.appendChild(caption);

    li.append(swatch, info, position);
    el.pieceList.appendChild(li);
  }
}

function renderLog() {
  if (log.revision === state.logRevision) return;
  state.logRevision = log.revision;

  el.log.innerHTML = '';

  if (!log.entries.length) {
    el.log.appendChild(
      emptyState('Nada aconteceu ainda', 'O registro começa quando a primeira peça entrar.')
    );
    return;
  }

  for (const entry of log.entries) {
    const li = document.createElement('li');
    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = entry.at.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const text = document.createElement('span');
    text.className = `kind-${entry.kind}`;
    text.textContent = entry.text;
    li.append(time, text);
    el.log.appendChild(li);
  }
}

function renderRoster() {
  el.rosterList.innerHTML = '';

  for (const entry of roster.list()) {
    const li = document.createElement('li');

    const id = document.createElement('span');
    id.className = 'id';
    id.textContent = entry.id;

    const name = document.createElement('input');
    name.type = 'text';
    name.value = entry.name;
    name.setAttribute('aria-label', `Nome da peça ${entry.id}`);
    name.addEventListener('change', () => update({ name: name.value }));

    const faction = document.createElement('select');
    faction.setAttribute('aria-label', `Facção da peça ${entry.id}`);
    for (const [value, meta] of Object.entries(FACTIONS)) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = meta.label;
      option.selected = value === entry.faction;
      faction.appendChild(option);
    }
    faction.addEventListener('change', () => update({ faction: faction.value }));

    const color = document.createElement('input');
    color.type = 'color';
    color.value = entry.color;
    color.setAttribute('aria-label', `Cor da peça ${entry.id}`);
    color.addEventListener('change', () => update({ color: color.value }));

    const remove = document.createElement('button');
    remove.className = 'remove';
    remove.setAttribute('aria-label', `Remover ${entry.name}`);
    remove.appendChild(icon('close'));
    remove.addEventListener('click', () => {
      roster.remove(entry.id);
      bus.send('roster', {});
      renderRoster();
    });

    function update(patch) {
      roster.upsert({ ...entry, ...patch });
      bus.send('roster', {});
      state.pieceKey = ''; // força a lista de peças a se redesenhar
    }

    li.append(id, name, faction, color, remove);
    el.rosterList.appendChild(li);
  }
}

function renderPalette() {
  el.palette.innerHTML = '';

  for (const [id, terrain] of Object.entries(TERRAINS)) {
    const button = document.createElement('button');
    button.className = 'brush';
    button.type = 'button';
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', String(id === state.terrain));

    const chip = document.createElement('span');
    chip.className = 'chip-color';
    chip.style.background = terrain.color || 'transparent';

    button.append(chip, document.createTextNode(terrain.label));
    button.addEventListener('click', () => {
      state.terrain = id;
      renderPalette();
    });
    el.palette.appendChild(button);
  }
}

/* ------------------------------------------------------------- indicadores */

function updateReadout() {
  el.mFps.textContent = state.fps.toFixed(0);
  el.mMs.textContent = state.simulating ? '—' : vision.detectMs.toFixed(0);
  el.mPieces.textContent = String(state.tracks.length);

  el.visionMode.textContent = state.simulating
    ? 'simulação'
    : !camera.isRunning
      ? 'parada'
      : vision.mode === 'worker'
        ? 'worker'
        : 'thread principal';

  if (state.simulating) {
    el.diag.textContent = 'peças virtuais — arraste no tabuleiro';
  } else if (camera.isRunning) {
    const { lastRawCount, rejectedCount } = vision.tracker;
    el.diag.textContent = `${lastRawCount} lido · ${rejectedCount} fora do elenco · ${state.tracks.length} confirmado`;
  } else {
    el.diag.textContent = '';
  }
}

function updateCameraControl() {
  const live = camera.isRunning;
  el.cameraBtn.setAttribute('aria-pressed', String(live));
  el.cameraState.textContent = live ? 'ativa' : 'desligada';
  el.cameraHint.hidden = live;
  el.video.classList.toggle('mirrored', live && camera.mirrored);
  el.torchBtn.disabled = !camera.supportsTorch;
  el.simBtn.setAttribute('aria-pressed', String(state.simulating));
}

function updateProjectorControl() {
  const connected = state.projector.connected;
  el.projectorBtn.setAttribute('aria-pressed', String(connected));
  el.projectorState.textContent = connected ? 'conectada' : 'fechada';
  el.calibBtn.disabled = !connected && !state.calib.active;
}

function updateCalibrationControl() {
  const active = state.calib.active;
  el.calibBtn.setAttribute('aria-pressed', String(active));
  el.calibState.textContent = active ? 'em curso' : state.matrix ? 'calibrado' : 'direto';
  el.calibBanner.hidden = !active;
  el.clearCalib.disabled = !state.matrix;
  if (!active) return;

  const index = state.calib.points.length;
  const target = state.calib.targets[index];
  el.calibBanner.textContent = target
    ? `Clique no visor da câmera onde aparece o alvo ${index + 1} — o do canto ${target.label}.`
    : 'Calculando a calibração…';
}

/* --------------------------------------------------------------- câmera */

async function startCamera() {
  try {
    await camera.start();
    vision.reset();
    el.cameraHint.classList.remove('error');
  } catch (error) {
    el.cameraHint.hidden = false;
    el.cameraHint.classList.add('error');
    el.cameraHint.innerHTML = '';
    const headline = document.createElement('p');
    headline.className = 'headline';
    headline.textContent = 'A câmera não abriu';
    const detail = document.createElement('p');
    detail.textContent = describeError(error);
    el.cameraHint.append(headline, detail);
    return;
  }
  updateCameraControl();
}

function stopCamera() {
  camera.stop();
  state.torchOn = false;
  vision.reset();
  el.cameraHint.classList.remove('error');
  el.cameraHint.innerHTML =
    '<p class="headline">Câmera desligada</p><p>Ligue a câmera acima e aponte para a mesa, de cima.</p>';
  updateCameraControl();
}

function describeError(error) {
  if (error?.name === 'NotAllowedError') {
    return 'A permissão foi negada. Libere a câmera para este site e tente de novo.';
  }
  if (error?.name === 'NotReadableError') {
    return 'Outro programa está usando a câmera. Feche-o e tente de novo.';
  }
  if (error?.name === 'NotFoundError') return 'Nenhuma câmera encontrada neste computador.';
  if (!window.isSecureContext) return 'Abra a página em https:// ou localhost.';
  return error?.message || 'Erro desconhecido ao abrir a câmera.';
}

el.cameraBtn.addEventListener('click', () => {
  camera.isRunning ? stopCamera() : startCamera();
});

el.flipBtn.addEventListener('click', async () => {
  if (!camera.isRunning) return startCamera();
  await camera.flip();
  vision.reset();
  updateCameraControl();
});

el.torchBtn.addEventListener('click', async () => {
  if (await camera.setTorch(!state.torchOn)) state.torchOn = !state.torchOn;
  el.torchBtn.setAttribute('aria-pressed', String(state.torchOn));
});

el.projectorBtn.addEventListener('click', () => {
  window.open('/projector.html', 'projector');
});

el.simBtn.addEventListener('click', () => {
  state.simulating = !state.simulating;
  if (state.simulating) {
    const layout = boardLayout(state.projector.aspect);
    const ids = roster.list().slice(0, 6).map((entry) => entry.id);
    simulation.setPieces(
      ids.map((id, index) => {
        const row = index < 3 ? 5 : 0;
        const col = [1, 3, 4][index % 3];
        const center = cellCenter(row, col, layout);
        return { id, nx: center.x, ny: center.y, size: layout.cell * 0.55 };
      })
    );
  }
  log.clear();
  state.pieceKey = '';
  updateCameraControl();
});

/* -------------------------------------------- tabuleiro: pintar e arrastar */

el.boardPreview.addEventListener('pointerdown', (event) => {
  const { nx, ny } = boardView.toNormalized(event.clientX, event.clientY, el.boardPreview);

  if (state.simulating && simulation.startDrag(nx, ny)) {
    el.boardPreview.setPointerCapture(event.pointerId);
    return;
  }

  const layout = state.scene?.layout || boardLayout(state.projector.aspect);
  const cell = cellAt(nx, ny, layout);
  if (!cell) return;

  // Clicar de novo na mesma casa com o mesmo pincel limpa — evita ter que ir
  // até a paleta só para desfazer.
  const current = board.get(cell.row, cell.col);
  board.set(cell.row, cell.col, current === state.terrain ? 'normal' : state.terrain);
  publishBoard();
});

el.boardPreview.addEventListener('pointermove', (event) => {
  if (!state.simulating || !simulation.dragging) return;
  const { nx, ny } = boardView.toNormalized(event.clientX, event.clientY, el.boardPreview);
  simulation.drag(nx, ny);
});

for (const type of ['pointerup', 'pointercancel']) {
  el.boardPreview.addEventListener(type, () => simulation.endDrag());
}

el.clearBoard.addEventListener('click', () => {
  board.clear();
  publishBoard();
});

/* ------------------------------------------------------------ calibração */

el.calibBtn.addEventListener('click', () => {
  if (state.calib.active) {
    state.calib = { active: false, targets: [], points: [] };
    bus.send('calib:stop', {});
  } else {
    bus.send('calib:start', {});
  }
  updateCalibrationControl();
});

el.overlay.addEventListener('pointerdown', (event) => {
  if (!state.calib.active) return;
  const { nx, ny } = cameraView.toNormalized(event.clientX, event.clientY, el.overlay);
  state.calib.points.push({ x: nx, y: ny });

  if (state.calib.points.length < state.calib.targets.length) {
    bus.send('calib:progress', { index: state.calib.points.length });
    updateCalibrationControl();
    return;
  }

  const matrix = computeHomography(state.calib.points, state.calib.targets);
  if (!matrix) {
    state.calib.points = [];
    bus.send('calib:progress', { index: 0 });
    el.calibBanner.textContent =
      'Os quatro pontos ficaram quase alinhados. Recomeçando — clique em cantos bem afastados.';
    return;
  }

  saveHomography(matrix);
  state.matrix = matrix;
  bus.send('homography', { matrix });
  state.calib = { active: false, targets: [], points: [] };
  bus.send('calib:stop', {});
  updateCalibrationControl();
});

el.clearCalib.addEventListener('click', () => {
  clearHomography();
  state.matrix = null;
  bus.send('homography', { matrix: null });
  updateCalibrationControl();
});

/* ------------------------------------------------------------- elenco */

el.addPiece.addEventListener('click', () => {
  const used = new Set(roster.list().map((entry) => entry.id));
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

el.clearLog.addEventListener('click', () => log.clear());

/* ------------------------------------------------------------ ajustes */

function bindRange(input, label, key, format, apply) {
  input.value = String(settings[key]);
  label.textContent = format(settings[key]);
  input.addEventListener('input', () => {
    settings[key] = Number(input.value);
    label.textContent = format(settings[key]);
    apply?.(settings[key]);
    saveSettings();
  });
}

bindRange(el.hamming, el.hammingValue, 'maxHamming', (v) => `${v} bits`, (v) =>
  vision.configure({ detector: { maxHammingDistance: v } })
);
bindRange(el.confirmFrames, el.confirmValue, 'confirmFrames', (v) => `${v} quadros`, (v) =>
  vision.configure({ tracker: { confirmFrames: v } })
);
bindRange(el.procWidth, el.procValue, 'procWidth', (v) => `${v} px`, (v) =>
  vision.configure({ detector: { procWidth: v } })
);
bindRange(el.threatCells, el.threatValue, 'threatCells', (v) => `${v} casa${v === 1 ? '' : 's'}`, () =>
  publishSettings()
);

el.onlyKnown.checked = settings.onlyKnown;
el.onlyKnown.addEventListener('change', () => {
  settings.onlyKnown = el.onlyKnown.checked;
  vision.reset();
  saveSettings();
});

el.showMoveRadius.checked = settings.showMoveRadius;
el.showMoveRadius.addEventListener('change', () => {
  settings.showMoveRadius = el.showMoveRadius.checked;
  publishSettings();
  saveSettings();
});

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    // storage indisponível
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignora
  }
}

/* --------------------------------------------------------------- início */

document.addEventListener('visibilitychange', () => {
  if (document.hidden && camera.isRunning) {
    stopCamera();
    state.wasRunning = true;
  } else if (!document.hidden && state.wasRunning) {
    state.wasRunning = false;
    startCamera();
  }
});

if (new URLSearchParams(location.search).has('sim')) {
  // ?sim=1 entra direto no modo simulação — para ensaiar a demo sem montar a mesa.
  el.simBtn.click();
}

hydrateIcons();
renderRoster();
renderPalette();
renderPieces();
renderLog();
updateCameraControl();
updateProjectorControl();
updateCalibrationControl();
updateReadout();
requestAnimationFrame(loop);
