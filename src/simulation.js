/**
 * Modo simulação: peças arrastáveis com o dedo, produzindo tracks no mesmo
 * formato do detector. Serve para desenvolver sem os marcadores impressos e
 * como plano B se a detecção falhar na hora da demo.
 */
export class Simulation {
  constructor(roster) {
    this.roster = roster;
    this.pieces = [];
    this.dragging = null;
    this.reset();
  }

  /**
   * @param {{minX:number,maxX:number,minY:number,maxY:number}} bounds área
   *   visível em coordenadas normalizadas, vinda do Viewport.
   */
  reset(bounds = { minX: 0, maxX: 1, minY: 0, maxY: 1.8 }) {
    const ids = this.roster.list().slice(0, 6).map((e) => e.id);
    const list = ids.length ? ids : [0, 1, 2, 3];
    const columns = 2;
    const rows = Math.ceil(list.length / columns);
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    // ocupa os 70% centrais da tela, para nenhuma peça nascer debaixo da barra
    this.pieces = list.map((id, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      return {
        id,
        nx: bounds.minX + width * (0.15 + ((col + 0.5) / columns) * 0.7),
        ny: bounds.minY + height * (0.15 + ((row + 0.5) / rows) * 0.7),
        angle: -Math.PI / 2,
        size: Math.min(width, height) * 0.09,
      };
    });
  }

  /** @returns {Array<object>} tracks no mesmo formato do MarkerTracker */
  getTracks(now) {
    return this.pieces.map((piece) => {
      const half = piece.size / 2;
      const cos = Math.cos(piece.angle);
      const sin = Math.sin(piece.angle);
      // cantos de um quadrado girado, na mesma ordem do detector
      const local = [
        [-half, -half],
        [half, -half],
        [half, half],
        [-half, half],
      ];
      return {
        id: piece.id,
        corners: local.map(([lx, ly]) => ({
          x: piece.nx + lx * cos - ly * sin,
          y: piece.ny + lx * sin + ly * cos,
        })),
        cx: piece.nx,
        cy: piece.ny,
        angle: piece.angle,
        size: piece.size,
        firstSeen: now,
        lastSeen: now,
        visible: true,
        confidence: 1,
        simulated: true,
      };
    });
  }

  /** Posiciona as peças em coordenadas já prontas (usado para nascer no tabuleiro). */
  setPieces(list) {
    this.pieces = list.map((piece) => ({ angle: -Math.PI / 2, size: 0.09, ...piece }));
    this.dragging = null;
  }

  pickAt(nx, ny) {
    let best = null;
    let bestDistance = Infinity;
    for (const piece of this.pieces) {
      const distance = Math.hypot(piece.nx - nx, piece.ny - ny);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = piece;
      }
    }
    // só pega se o toque caiu perto o bastante da peça
    return best && bestDistance < best.size * 1.6 ? best : null;
  }

  startDrag(nx, ny) {
    this.dragging = this.pickAt(nx, ny);
    return this.dragging;
  }

  drag(nx, ny) {
    if (!this.dragging) return;
    const dx = nx - this.dragging.nx;
    const dy = ny - this.dragging.ny;
    // a peça "olha" para onde está andando, desde que o movimento não seja ruído
    if (Math.hypot(dx, dy) > 0.004) {
      this.dragging.angle = Math.atan2(dy, dx);
    }
    this.dragging.nx = nx;
    this.dragging.ny = ny;
  }

  endDrag() {
    this.dragging = null;
  }
}
