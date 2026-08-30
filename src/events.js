import { cellLabel, TERRAINS } from './board.js';

/**
 * Transforma mudança de estado em linhas que o mestre lê durante a partida.
 * Só reage a transições — peça parada não gera ruído no log.
 */
export class EventLog {
  constructor(limit = 60) {
    this.entries = [];
    this.limit = limit;
    this.previousCells = new Map();
    this.previousThreats = new Set();
    this.revision = 0;
  }

  clear() {
    this.entries = [];
    this.previousCells.clear();
    this.previousThreats.clear();
    this.revision++;
  }

  push(kind, text) {
    this.entries.unshift({ kind, text, at: new Date() });
    if (this.entries.length > this.limit) this.entries.length = this.limit;
    this.revision++;
  }

  /**
   * @param {Array} tracks peças confirmadas (espaço do projetor)
   * @param {Map<number,{row:number,col:number}>} cells
   * @param {Array} threats pares em alcance
   */
  update({ tracks, cells, threats, roster, board }) {
    const alive = new Set();

    for (const track of tracks) {
      alive.add(track.id);
      const entry = roster.get(track.id);
      const cell = cells.get(track.id) || null;
      const key = cell ? `${cell.row},${cell.col}` : 'fora';
      const previous = this.previousCells.get(track.id);

      if (previous === undefined) {
        this.push('enter', `${entry.name} entrou em ${cellLabel(cell)}`);
      } else if (previous !== key) {
        const from = previous === 'fora' ? 'fora do tabuleiro' : labelFromKey(previous);
        this.push('move', `${entry.name}: ${from} → ${cellLabel(cell)}`);

        if (cell) {
          const terrain = board.get(cell.row, cell.col);
          if (terrain !== 'normal') {
            const meta = TERRAINS[terrain];
            const kind = meta.damage ? 'danger' : 'terrain';
            this.push(kind, `${entry.name} está em ${meta.label} (${cellLabel(cell)})`);
          }
        }
      }
      this.previousCells.set(track.id, key);
    }

    for (const id of [...this.previousCells.keys()]) {
      if (alive.has(id)) continue;
      this.push('exit', `${roster.get(id).name} saiu de cena`);
      this.previousCells.delete(id);
    }

    const current = new Set();
    for (const threat of threats) {
      const key = [threat.a.id, threat.b.id].sort((x, y) => x - y).join('-');
      current.add(key);
      if (!this.previousThreats.has(key)) {
        this.push(
          'threat',
          `${roster.get(threat.a.id).name} e ${roster.get(threat.b.id).name} estão a ${threat.distance} casa${threat.distance === 1 ? '' : 's'}`
        );
      }
    }
    this.previousThreats = current;
  }
}

function labelFromKey(key) {
  const [row, col] = key.split(',').map(Number);
  return cellLabel({ row, col });
}
