import { Bus } from './bus.js';
import { Roster } from './roster.js';
import { Viewport } from './viewport.js';
import { drawProjectorScene } from './projectorScene.js';
import { IDENTITY } from './homography.js';
import { Board } from './board.js';
import { DEFAULT_RULES } from './rules.js';
import { loadHomography, targetsInProjectorSpace } from './calibration.js';

const STALE_MS = 2500; // sem notícias do controle por mais que isso = desconectado
const HEARTBEAT_MS = 1000;

const el = {
  canvas: document.getElementById('projection'),
  hud: document.getElementById('hud'),
  dot: document.getElementById('dot'),
  status: document.getElementById('status'),
  calibNote: document.getElementById('calibNote'),
  waiting: document.getElementById('waiting'),
};

const ctx = el.canvas.getContext('2d');
const view = new Viewport();
// O Viewport foi feito para corrigir o corte do <video>; aqui não há vídeo, e
// este "frame" degenerado faz ele virar um mapeamento direto para a tela.
const NO_VIDEO = { videoWidth: 0, videoHeight: 0 };

const roster = new Roster();
const board = new Board();
const bus = new Bus();

const state = {
  tracks: [],
  identity: false,
  lastMessage: -Infinity,
  matrix: loadHomography(),
  calibration: null, // { targets, index }
  settings: {
    threatCells: DEFAULT_RULES.threatCells,
    moveRadius: 2, // em células
    showLabels: true,
    showMoveRadius: true,
    showMarkerOutline: false,
    showGrid: true,
  },
};

/* --------------------------------------------------------------- canal */

bus.on('tracks', (payload) => {
  state.tracks = payload?.tracks || [];
  // Peças de simulação já vêm no espaço do tabuleiro: aplicar a calibração nelas
  // as jogaria para fora da mesa.
  state.identity = Boolean(payload?.identity);
  state.lastMessage = performance.now();
});

bus.on('settings', (payload) => {
  Object.assign(state.settings, payload || {});
  state.lastMessage = performance.now();
});

bus.on('roster', () => {
  roster.load(); // o console avisa quando o elenco muda; recarregamos do storage
});

bus.on('board', (payload) => {
  board.fromJSON(payload?.terrain);
  state.lastMessage = performance.now();
});

bus.on('homography', (payload) => {
  state.matrix = payload?.matrix || null;
  state.lastMessage = performance.now();
});

bus.on('calib:start', () => {
  const aspect = view.height / view.width;
  const targets = targetsInProjectorSpace(aspect);
  state.calibration = { targets, index: 0 };
  bus.send('calib:targets', { targets, aspect });
});

bus.on('calib:progress', (payload) => {
  if (state.calibration) state.calibration.index = payload?.index ?? 0;
});

bus.on('calib:stop', () => {
  state.calibration = null;
});

// Deixa o controle saber que existe uma projeção aberta.
function describeScreen() {
  return { aspect: view.height / Math.max(1, view.width) };
}

bus.send('projector:ready', describeScreen());
setInterval(() => bus.send('projector:alive', describeScreen()), HEARTBEAT_MS);
bus.on('control:hello', () => bus.send('projector:ready', describeScreen()));

/* ---------------------------------------------------------------- loop */

function loop(now) {
  requestAnimationFrame(loop);
  view.measure(el.canvas, NO_VIDEO, false);

  const connected = now - state.lastMessage < STALE_MS;
  const calibrating = Boolean(state.calibration);
  el.waiting.hidden = connected || calibrating;

  if (calibrating) {
    drawCalibration(now);
  } else if (connected) {
    drawGame(now);
  } else {
    ctx.clearRect(0, 0, view.width, view.height);
  }

  updateHud(connected, calibrating);
}

function drawGame(now) {
  drawProjectorScene(ctx, {
    tracks: state.tracks,
    roster,
    board,
    view,
    matrix: state.identity ? IDENTITY : state.matrix,
    settings: state.settings,
    time: now,
  });
}

function drawCalibration(now) {
  const { targets, index } = state.calibration;
  const scale = view.dpr;
  const pulse = 0.5 + 0.5 * Math.sin(now / 260);

  ctx.clearRect(0, 0, view.width, view.height);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  targets.forEach((target, i) => {
    const x = view.toScreenX(target.x);
    const y = view.toScreenY(target.y);
    const done = i < index;
    const active = i === index;
    const radius = (active ? 26 + 6 * pulse : 20) * scale;

    ctx.globalAlpha = active ? 1 : done ? 0.35 : 0.6;
    ctx.fillStyle = done ? '#4ade80' : '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    if (active) {
      // Anel externo pulsante: é neste alvo que a pessoa tem que clicar agora.
      ctx.strokeStyle = '#ffc857';
      ctx.lineWidth = 3 * scale;
      ctx.beginPath();
      ctx.arc(x, y, radius + (14 + 10 * pulse) * scale, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = '#05070d';
    ctx.font = `700 ${20 * scale}px system-ui, sans-serif`;
    ctx.fillText(String(i + 1), x, y);
  });

  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffffff';
  ctx.font = `600 ${18 * scale}px system-ui, sans-serif`;
  ctx.fillText(
    `Calibrando — clique no alvo ${Math.min(index + 1, targets.length)} na janela de controle`,
    view.width / 2,
    view.height / 2
  );
  ctx.restore();
}

function updateHud(connected, calibrating) {
  el.dot.className = `dot ${calibrating ? 'calib' : connected ? 'live' : ''}`;
  el.status.textContent = calibrating
    ? 'modo calibração'
    : connected
      ? `${state.tracks.length} peça${state.tracks.length === 1 ? '' : 's'} recebida${state.tracks.length === 1 ? '' : 's'}`
      : 'aguardando a janela de controle…';

  el.calibNote.textContent = state.identity
    ? 'peças simuladas — projetando direto'
    : state.matrix
      ? 'calibrado'
      : 'sem calibração — projetando direto (bom para testar no PC)';
}

/* ------------------------------------------------------------ teclado */

document.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if (key === 'f') {
    toggleFullscreen();
  } else if (key === 'h') {
    el.hud.classList.toggle('hidden');
  }
});

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen?.();
  } else {
    document.documentElement.requestFullscreen?.().catch(() => {
      // alguns navegadores exigem gesto direto; nesse caso o F simplesmente não pega
    });
  }
}

// Some com o cursor em cima da projeção depois de um tempo parado.
let idleTimer = 0;
function markActive() {
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => document.body.classList.add('idle'), 2500);
}
document.addEventListener('mousemove', markActive);
markActive();

window.addEventListener('beforeunload', () => bus.close());

requestAnimationFrame(loop);
