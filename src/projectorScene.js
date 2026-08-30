import { drawScene } from './overlay.js';
import { findThreatsByCell, unitSize, DEFAULT_RULES } from './rules.js';
import { IDENTITY } from './homography.js';
import { projectTrack } from './calibration.js';
import { boardLayout, cellAt, drawBoard, highlightCell } from './board.js';

/**
 * Desenha o que sai pelo projetor: o tabuleiro 6x6 e as peças em cima dele.
 *
 * Usada nos dois lugares — na janela de projeção e no preview do console — de
 * propósito: se o preview usasse outro código, ele deixaria de servir para
 * depurar exatamente quando o desenho divergisse.
 *
 * @returns {{projected:Array, layout:object, cells:Map<number,object>, threats:Array}}
 */
export function drawProjectorScene(ctx, { tracks, roster, board, view, matrix, settings, time, box }) {
  if (box) {
    // Preview: pinta só a área com a proporção da tela do projetor.
    ctx.clearRect(0, 0, view.width, view.height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.width, box.height);
    ctx.clip();
    ctx.fillStyle = '#000';
    ctx.fillRect(box.x, box.y, box.width, box.height);
  } else {
    ctx.clearRect(0, 0, view.width, view.height);
  }

  const aspect = box ? box.height / box.width : view.height / Math.max(1, view.width);
  const layout = boardLayout(aspect);

  const projected = tracks.map((track) => projectTrack(track, matrix || IDENTITY));
  const cells = new Map();
  for (const track of projected) {
    const cell = cellAt(track.cx, track.cy, layout);
    if (cell) cells.set(track.id, cell);
  }

  if (board) {
    drawBoard(ctx, view, board, layout, { labels: settings.showLabels !== false, time });
    for (const track of projected) {
      const cell = cells.get(track.id);
      if (cell) highlightCell(ctx, view, cell, layout, roster.get(track.id).color, 0.16);
    }
  }

  const threats = findThreatsByCell(
    projected,
    cells,
    roster,
    settings.threatCells ?? DEFAULT_RULES.threatCells
  );

  drawScene(ctx, {
    tracks: projected,
    roster,
    view,
    threats,
    bounds: {
      left: view.toScreenX(layout.x),
      right: view.toScreenX(layout.x + layout.side),
      top: view.toScreenY(layout.y),
      bottom: view.toScreenY(layout.y + layout.side),
    },
    unit: layout.cell || unitSize(projected),
    time,
    settings: { ...settings, drawGrid: false, projector: true },
  });

  if (box) {
    ctx.restore();
    ctx.strokeStyle = 'rgba(110,168,255,0.45)';
    ctx.lineWidth = Math.max(1, view.dpr);
    ctx.strokeRect(box.x, box.y, box.width, box.height);
  }

  return { projected, layout, cells, threats };
}
