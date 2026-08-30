/**
 * Lógica de jogo. Tudo aqui é medido em "unidades de marcador": 1 unidade =
 * o lado do marcador impresso. Como a escala vem do próprio marcador visto na
 * imagem, as regras valem igual com o celular a 40cm ou a 1,5m da mesa.
 */

import { cellDistance } from './board.js';

export const DEFAULT_RULES = {
  threatCells: 1, // adjacência: inimigo colado é ameaça
  threatRange: 2.2, // distância em que um inimigo já ameaça um herói
  moveRadius: 4, // raio de deslocamento desenhado em volta da peça selecionada
};

export function unitSize(tracks) {
  if (!tracks.length) return 0.08;
  const sizes = tracks.map((t) => t.size).sort((a, b) => a - b);
  return sizes[Math.floor(sizes.length / 2)]; // mediana: um marcador mal lido não estraga a escala
}

/**
 * Pares herói↔inimigo dentro do alcance de ameaça.
 * @returns {Array<{a: object, b: object, distance: number}>}
 */
export function findThreats(tracks, roster, unit, rules = DEFAULT_RULES) {
  const threats = [];
  if (unit <= 0) return threats;

  for (let i = 0; i < tracks.length; i++) {
    for (let j = i + 1; j < tracks.length; j++) {
      const a = tracks[i];
      const b = tracks[j];
      const fa = roster.get(a.id).faction;
      const fb = roster.get(b.id).faction;
      if (fa === fb) continue;
      if (fa === 'neutral' || fb === 'neutral') continue;

      const distance = Math.hypot(a.cx - b.cx, a.cy - b.cy) / unit;
      if (distance <= rules.threatRange) {
        threats.push({ a, b, distance });
      }
    }
  }
  return threats.sort((x, y) => x.distance - y.distance);
}

/**
 * Ameaças medidas em células do tabuleiro. É a versão que vale quando existe
 * tabuleiro: o mestre raciocina em "duas casas de distância", não em fração de
 * marcador.
 * @param {Map<number, {row:number,col:number}>} cells peça → célula
 */
export function findThreatsByCell(tracks, cells, roster, range = 1) {
  const threats = [];

  for (let i = 0; i < tracks.length; i++) {
    for (let j = i + 1; j < tracks.length; j++) {
      const a = tracks[i];
      const b = tracks[j];
      const fa = roster.get(a.id).faction;
      const fb = roster.get(b.id).faction;
      if (fa === fb || fa === 'neutral' || fb === 'neutral') continue;

      const distance = cellDistance(cells.get(a.id), cells.get(b.id));
      if (distance <= range) threats.push({ a, b, distance, inCells: true });
    }
  }
  return threats.sort((x, y) => x.distance - y.distance);
}
