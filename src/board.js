/**
 * O tabuleiro: uma grade fixa de 6x6 desenhada na área de projeção. É o mapa do
 * jogo — a peça não fica "num ponto qualquer", fica numa célula, e é a célula que
 * as regras enxergam.
 */

export const BOARD_SIZE = 6;
const STORAGE_KEY = 'rpg-ar:board:v1';

export const TERRAINS = {
  normal: { label: 'Normal', color: null, blocks: false },
  difficult: { label: 'Difícil', color: '#a98240', blocks: false, alpha: 0.3 },
  water: { label: 'Água', color: '#2f6fb5', blocks: false, alpha: 0.4 },
  lava: { label: 'Lava', color: '#d64520', blocks: false, alpha: 0.5, damage: true },
  wall: { label: 'Parede', color: '#7d8496', blocks: true, alpha: 0.75 },
  objective: { label: 'Objetivo', color: '#e0b33a', blocks: false, alpha: 0.45 },
};

const COLUMN_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

/**
 * Onde o tabuleiro fica dentro da área de projeção, em coordenadas normalizadas
 * pela largura. Sempre um quadrado centralizado — mesa é quadrada, projetor não.
 * @param {number} aspect altura/largura da tela do projetor
 */
export function boardLayout(aspect, margin = 0.06) {
  const side = Math.min(1, aspect) * (1 - margin * 2);
  return {
    x: (1 - side) / 2,
    y: (aspect - side) / 2,
    side,
    cell: side / BOARD_SIZE,
  };
}

/** @returns {{row:number,col:number}|null} null se o ponto caiu fora do tabuleiro */
export function cellAt(x, y, layout) {
  const col = Math.floor((x - layout.x) / layout.cell);
  const row = Math.floor((y - layout.y) / layout.cell);
  if (col < 0 || row < 0 || col >= BOARD_SIZE || row >= BOARD_SIZE) return null;
  return { row, col };
}

/** Centro da célula, em coordenadas de projeção. */
export function cellCenter(row, col, layout) {
  return {
    x: layout.x + (col + 0.5) * layout.cell,
    y: layout.y + (row + 0.5) * layout.cell,
  };
}

export function cellLabel(cell) {
  return cell ? `${COLUMN_LABELS[cell.col]}${cell.row + 1}` : '—';
}

export function cellKey(row, col) {
  return `${row},${col}`;
}

/** Distância em células (Chebyshev: diagonal conta como 1, como na maioria das mesas). */
export function cellDistance(a, b) {
  if (!a || !b) return Infinity;
  return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
}

export class Board {
  constructor() {
    /** @type {Map<string, string>} chave 'linha,coluna' → id do terreno */
    this.terrain = new Map();
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      this.terrain = new Map(Object.entries(parsed).filter(([, v]) => TERRAINS[v]));
    } catch {
      this.terrain = new Map();
    }
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(this.terrain)));
    } catch {
      // sem persistência; o mapa vale para a sessão
    }
  }

  get(row, col) {
    return this.terrain.get(cellKey(row, col)) || 'normal';
  }

  set(row, col, type) {
    if (!TERRAINS[type]) return;
    if (type === 'normal') this.terrain.delete(cellKey(row, col));
    else this.terrain.set(cellKey(row, col), type);
    this.save();
  }

  clear() {
    this.terrain.clear();
    this.save();
  }

  toJSON() {
    return Object.fromEntries(this.terrain);
  }

  fromJSON(data) {
    this.terrain = new Map(Object.entries(data || {}).filter(([, v]) => TERRAINS[v]));
  }
}

/**
 * Desenha o tabuleiro. Usado tanto na projeção quanto no preview do console.
 */
export function drawBoard(ctx, view, board, layout, { labels = true, time = 0 } = {}) {
  const scale = view.dpr;
  const x0 = view.toScreenX(layout.x);
  const y0 = view.toScreenY(layout.y);
  const side = view.toScreenLength(layout.side);
  const cell = view.toScreenLength(layout.cell);
  const pulse = 0.5 + 0.5 * Math.sin(time / 700);

  ctx.save();

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const terrain = TERRAINS[board.get(row, col)];
      if (!terrain?.color) continue;
      ctx.globalAlpha = terrain.alpha * (terrain.damage ? 0.75 + 0.25 * pulse : 1);
      ctx.fillStyle = terrain.color;
      ctx.fillRect(x0 + col * cell, y0 + row * cell, cell, cell);
    }
  }

  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(120,170,255,0.35)';
  ctx.lineWidth = 1.2 * scale;
  ctx.beginPath();
  for (let i = 0; i <= BOARD_SIZE; i++) {
    const offset = i * cell;
    ctx.moveTo(x0 + offset, y0);
    ctx.lineTo(x0 + offset, y0 + side);
    ctx.moveTo(x0, y0 + offset);
    ctx.lineTo(x0 + side, y0 + offset);
  }
  ctx.stroke();

  // Moldura mais forte: é a borda útil da mesa, tem que ser visível na madeira.
  ctx.strokeStyle = 'rgba(150,195,255,0.75)';
  ctx.lineWidth = 2.5 * scale;
  ctx.strokeRect(x0, y0, side, side);

  if (labels) {
    ctx.fillStyle = 'rgba(160,190,235,0.75)';
    ctx.font = `600 ${Math.max(9, cell * 0.16)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < BOARD_SIZE; i++) {
      ctx.fillText(COLUMN_LABELS[i], x0 + (i + 0.5) * cell, y0 - cell * 0.22);
      ctx.fillText(String(i + 1), x0 - cell * 0.22, y0 + (i + 0.5) * cell);
    }
  }

  ctx.restore();
}

/** Destaca a célula ocupada por uma peça. */
export function highlightCell(ctx, view, cell, layout, color, alpha = 0.22) {
  if (!cell) return;
  const x = view.toScreenX(layout.x + cell.col * layout.cell);
  const y = view.toScreenY(layout.y + cell.row * layout.cell);
  const size = view.toScreenLength(layout.cell);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, size, size);
  ctx.globalAlpha = Math.min(1, alpha * 3);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2 * view.dpr;
  ctx.strokeRect(x, y, size, size);
  ctx.restore();
}
