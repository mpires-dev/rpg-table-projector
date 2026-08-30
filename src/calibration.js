import { IDENTITY, applyHomography } from './homography.js';
import { deriveFromCorners } from './tracker.js';

const STORAGE_KEY = 'rpg-ar:homography:v1';

/**
 * Onde a janela de projeção desenha os alvos de calibração, em coordenadas
 * normalizadas pela largura da tela do projetor. Ficam a 12% da borda porque
 * projetor costuma distorcer justamente nos cantos extremos.
 */
export const CALIBRATION_TARGETS = [
  { x: 0.12, y: 0.12, label: 'superior esquerdo' },
  { x: 0.88, y: 0.12, label: 'superior direito' },
  { x: 0.88, y: 0.88, label: 'inferior direito' },
  { x: 0.12, y: 0.88, label: 'inferior esquerdo' },
];

/**
 * Os alvos são definidos em fração da tela, mas o resto do app normaliza os dois
 * eixos pela largura. Esta função devolve os alvos já nesse sistema.
 * @param {number} aspect altura/largura da tela do projetor
 */
export function targetsInProjectorSpace(aspect) {
  return CALIBRATION_TARGETS.map((t) => ({ ...t, y: t.y * aspect }));
}

export function loadHomography() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length === 9 ? parsed : null;
  } catch {
    return null;
  }
}

export function saveHomography(matrix) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(matrix));
  } catch {
    // sem persistência; a matriz ainda vale para esta sessão
  }
}

export function clearHomography() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignora
  }
}

/**
 * Leva um track do espaço da câmera para o espaço do projetor.
 *
 * Transforma os quatro cantos e recalcula centro/ângulo/tamanho a partir deles —
 * projetar só o centro daria posição certa e tamanho errado, porque a
 * perspectiva encolhe o lado distante da mesa.
 */
export function projectTrack(track, matrix = IDENTITY) {
  const corners = track.corners.map((c) => applyHomography(matrix, c.x, c.y));
  const projected = { ...track, corners };
  deriveFromCorners(projected);
  return projected;
}
