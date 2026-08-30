import { Bus } from './bus.js';
import { Roster } from './roster.js';
import { Viewport } from './viewport.js';
import { drawProjectorScene } from './projectorScene.js';
import { IDENTITY } from './homography.js';
import { Board, BOARD_SIZE, boardLayout, cellCenter, drawBoard, highlightCell } from './board.js';
import { DEFAULT_RULES } from './rules.js';
import { loadHomography } from './calibration.js';

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
  calibration: false,
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
  state.calibration = true;
});

bus.on('calib:stop', () => {
  state.calibration = false;
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

/**
 * Durante a calibração a projeção mostra o tabuleiro que ela pretende desenhar,
 * com os quatro cantos acesos. É onde as peças precisam ficar: o mestre alinha
 * objeto físico com luz, sem clicar em nada.
 */
function drawCalibration(now)
{
    const scale = view.dpr;
    const pulse = 0.5 + 0.5 * Math.sin(now / 260);
    const aspect = view.height / Math.max(1, view.width);
    const layout = boardLayout(aspect);

    ctx.clearRect(0, 0, view.width, view.height);
    drawBoard(ctx, view, board, layout, { labels: true, time: now });

    // Os alvos ficam no centro das casas de canto: é ali que a peça pousa.
    const ultima = BOARD_SIZE - 1;
    const casas = [
      { row: 0, col: 0 },
      { row: 0, col: ultima },
      { row: ultima, col: ultima },
      { row: ultima, col: 0 },
    ];
    for (const casa of casas) {
      highlightCell(ctx, view, casa, layout, '#ffc857', 0.2);
    }
    const cantos = casas.map((casa) => cellCenter(casa.row, casa.col, layout));

    ctx.save();
    for (const canto of cantos) {
      const x = view.toScreenX(canto.x);
      const y = view.toScreenY(canto.y);
      const raio = (26 + 8 * pulse) * scale;

      ctx.fillStyle = '#ffc857';
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(x, y, raio, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ffc857';
      ctx.lineWidth = 3 * scale;
      ctx.beginPath();
      ctx.arc(x, y, raio, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 ${20 * scale}px system-ui, sans-serif`;
    ctx.fillText(
      'Ponha uma peça no centro de cada casa acesa',
      view.width / 2,
      view.toScreenY(layout.y + layout.side) + 60 * scale
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

/* --------------------------------------------- escuta do servidor */

/**
 * O canal local só alcança abas do mesmo navegador. Escutando o servidor, esta
 * projeção funciona numa máquina diferente da do console — que é o arranjo real
 * da mesa, com o projetor num computador e o mestre noutro.
 *
 * O canal local continua sendo a fonte preferida quando existe: ele entrega a
 * 30 Hz, enquanto o servidor só fala quando algo muda.
 */
let calibracaoAplicada = -1;

function ouvirServidor() {
  if (typeof EventSource === 'undefined') return;
  const fonte = new EventSource('/api/events');

  fonte.addEventListener('message', (event) => {
    let dados;
    try {
      dados = JSON.parse(event.data);
    } catch {
      return;
    }

    if (
      typeof dados.calibrationVersion === 'number' &&
      dados.calibrationVersion !== calibracaoAplicada
    ) {
      calibracaoAplicada = dados.calibrationVersion;
      state.matrix = dados.calibration || null;
    }

    if (dados.terrain) board.fromJSON(dados.terrain);

    // Só assume as peças quando o canal local está calado há um tempo.
    const semCanalLocal = performance.now() - state.lastMessage > 2500;
    if (semCanalLocal && Array.isArray(dados.pieces)) {
      state.tracks = dados.pieces;
      state.identity = false;
      state.lastMessage = performance.now();
    }
  });
}

ouvirServidor();

requestAnimationFrame(loop);
