/**
 * Homografia: a matriz 3x3 que converte um ponto visto pela câmera no ponto
 * correspondente da área de projeção. É o coração da calibração — câmera e
 * projetor olham a mesa de ângulos diferentes, e isso concilia os dois.
 *
 * Implementado à mão (uns 60 números) em vez de puxar uma lib: é o cálculo mais
 * crítico do projeto e vale ter ele legível e testável aqui dentro.
 */

export const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/**
 * Resolve a matriz que leva os 4 pontos de origem nos 4 de destino.
 * @param {Array<{x:number,y:number}>} src 4 pontos no espaço da câmera
 * @param {Array<{x:number,y:number}>} dst 4 pontos no espaço do projetor
 * @returns {number[]|null} matriz em row-major (9 valores), ou null se os
 *   pontos forem degenerados (colineares, repetidos)
 */
export function computeHomography(src, dst) {
  if (src?.length !== 4 || dst?.length !== 4) return null;

  // Cada correspondência dá duas equações lineares nos 8 graus de liberdade
  // (h8 é fixado em 1, já que a matriz só importa a menos de escala).
  const a = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }

  const h = solve(a, b);
  if (!h) return null;
  return [...h, 1];
}

/** @returns {{x:number,y:number}} */
export function applyHomography(h, x, y) {
  const w = h[6] * x + h[7] * y + h[8];
  if (Math.abs(w) < 1e-12) return { x: 0, y: 0 };
  return {
    x: (h[0] * x + h[1] * y + h[2]) / w,
    y: (h[3] * x + h[4] * y + h[5]) / w,
  };
}

/** Eliminação de Gauss com pivoteamento parcial. */
function solve(a, b) {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    }
    if (Math.abs(m[pivot][col]) < 1e-10) return null; // sistema degenerado
    [m[col], m[pivot]] = [m[pivot], m[col]];

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = m[row][col] / m[col][col];
      if (factor === 0) continue;
      for (let k = col; k <= n; k++) m[row][k] -= factor * m[col][k];
    }
  }

  return m.map((row, i) => row[n] / row[i]);
}
