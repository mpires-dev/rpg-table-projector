/**
 * Sistema de coordenadas usado em todo o app:
 *   nx = x / larguraDoFrame
 *   ny = y / larguraDoFrame   <-- dividido pela LARGURA de propósito
 *
 * Dividir os dois eixos pela largura preserva a proporção, então distância
 * euclidiana entre dois pontos continua sendo distância de verdade. O eixo Y
 * vai de 0 até (altura/largura) em vez de 0..1, e está tudo certo.
 *
 * Este módulo não detecta nada: recebe os marcadores já achados (ver
 * detectCore.js) e cuida de transformá-los em peças estáveis na mesa.
 */

const DEFAULT_OPTIONS = {
  smoothing: 0.4, // 0 = travado no valor antigo, 1 = sem suavização nenhuma
  holdMs: 1200, // sobrevida depois que a mão do jogador tampa o marcador
  confirmFrames: 3, // detecções seguidas antes de virar peça de verdade
  candidateMs: 250, // paciência com quem ainda não confirmou
};

export class MarkerTracker {
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    /** @type {Map<number, object>} */
    this.tracks = new Map();
    this.lastRawCount = 0;
    this.rejectedCount = 0;
  }

  configure(partial = {}) {
    Object.assign(this.options, partial);
  }

  setSmoothing(value) {
    this.options.smoothing = value;
  }

  reset() {
    this.tracks.clear();
  }

  /**
   * @param {Array<{id:number,corners:Array<{x:number,y:number}>}>} markers
   * @param {number} now performance.now()
   * @param {(id:number)=>boolean} [accept] filtro extra de ID (ex.: só elenco)
   * @returns {Array<object>} peças confirmadas, já suavizadas
   */
  update(markers, now, accept) {
    this.lastRawCount = markers.length;
    this.rejectedCount = 0;
    const alpha = this.options.smoothing;
    const seen = new Set();

    for (const marker of markers) {
      if (accept && !accept(marker.id)) {
        this.rejectedCount++;
        continue;
      }
      seen.add(marker.id);
      const existing = this.tracks.get(marker.id);

      if (!existing) {
        this.tracks.set(marker.id, buildTrack(marker, now));
        continue;
      }

      // EMA canto a canto. Suavizar os cantos (e não o centro) mantém posição
      // e rotação consistentes entre si — nada de peça girando sem sair do lugar.
      for (let i = 0; i < 4; i++) {
        existing.corners[i].x += (marker.corners[i].x - existing.corners[i].x) * alpha;
        existing.corners[i].y += (marker.corners[i].y - existing.corners[i].y) * alpha;
      }
      existing.lastSeen = now;
      existing.visible = true;
      existing.hits++;
      deriveFromCorners(existing);
    }

    const confirmed = [];

    for (const [id, track] of this.tracks) {
      if (!seen.has(id)) {
        track.visible = false;
        // Quem ainda não provou que existe tem paciência curta; peça confirmada
        // ganha o hold inteiro, porque sumir por oclusão é normal.
        const patience = track.confirmed ? this.options.holdMs : this.options.candidateMs;
        if (now - track.lastSeen > patience) {
          this.tracks.delete(id);
          continue;
        }
      }

      if (!track.confirmed && track.hits >= this.options.confirmFrames) {
        track.confirmed = true;
      }
      if (!track.confirmed) continue;

      // 1 enquanto visível, decai até 0 durante o hold — o overlay usa isso pra fade
      track.confidence = track.visible
        ? 1
        : Math.max(0, 1 - (now - track.lastSeen) / this.options.holdMs);
      confirmed.push(track);
    }

    return confirmed;
  }
}

function buildTrack(marker, now) {
  const track = {
    id: marker.id,
    corners: marker.corners.map((c) => ({ ...c })),
    cx: 0,
    cy: 0,
    angle: 0,
    size: 0,
    hits: 1,
    confirmed: false,
    firstSeen: now,
    lastSeen: now,
    visible: true,
    confidence: 1,
  };
  deriveFromCorners(track);
  return track;
}

/**
 * Recalcula centro, ângulo e tamanho a partir dos 4 cantos. Exportada porque a
 * janela de projeção precisa refazer essa conta depois de passar os cantos pela
 * homografia — o centro projetado não é a projeção do centro.
 */
export function deriveFromCorners(track) {
  const c = track.corners;
  track.cx = (c[0].x + c[1].x + c[2].x + c[3].x) / 4;
  track.cy = (c[0].y + c[1].y + c[2].y + c[3].y) / 4;

  // Ângulo do lado "de cima" do marcador. Como o js-aruco2 devolve os cantos já
  // rotacionados de acordo com o ID decodificado, o canto 0 é sempre o mesmo
  // canto físico — então isso é a orientação real da peça, não um chute.
  track.angle = Math.atan2(c[1].y - c[0].y, c[1].x - c[0].x);

  let perimeter = 0;
  for (let i = 0; i < 4; i++) {
    const a = c[i];
    const b = c[(i + 1) % 4];
    perimeter += Math.hypot(b.x - a.x, b.y - a.y);
  }
  // Lado médio do marcador, a unidade de medida física do app.
  track.size = perimeter / 4;
}
