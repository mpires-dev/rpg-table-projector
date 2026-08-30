/**
 * Ícones do Heroicons (MIT), importados como SVG cru e injetados no DOM.
 *
 * Vêm todos do mesmo conjunto 24/outline, então stroke, cantos e peso óptico
 * batem sem ajuste — é o que mantém a barra coerente quando um ícone entra ou
 * sai. O tamanho vem do CSS (`.icon`), não de atributos no SVG.
 */
import camera from 'heroicons/24/outline/camera.svg?raw';
import tv from 'heroicons/24/outline/tv.svg?raw';
import viewfinder from 'heroicons/24/outline/viewfinder-circle.svg?raw';
import arrowsRightLeft from 'heroicons/24/outline/arrows-right-left.svg?raw';
import lightBulb from 'heroicons/24/outline/light-bulb.svg?raw';
import sparkles from 'heroicons/24/outline/sparkles.svg?raw';
import tableCells from 'heroicons/24/outline/table-cells.svg?raw';
import userGroup from 'heroicons/24/outline/user-group.svg?raw';
import clock from 'heroicons/24/outline/clock.svg?raw';
import adjustments from 'heroicons/24/outline/adjustments-horizontal.svg?raw';
import plus from 'heroicons/24/outline/plus.svg?raw';
import arrowPath from 'heroicons/24/outline/arrow-path.svg?raw';
import trash from 'heroicons/24/outline/trash.svg?raw';
import printer from 'heroicons/24/outline/printer.svg?raw';
import devicePhone from 'heroicons/24/outline/device-phone-mobile.svg?raw';
import xMark from 'heroicons/24/outline/x-mark.svg?raw';
import exclamation from 'heroicons/24/outline/exclamation-triangle.svg?raw';
import paintBrush from 'heroicons/24/outline/paint-brush.svg?raw';
import arrowUpRight from 'heroicons/24/outline/arrow-top-right-on-square.svg?raw';

const ICONS = {
  camera,
  projector: tv,
  calibrate: viewfinder,
  flip: arrowsRightLeft,
  torch: lightBulb,
  simulate: sparkles,
  board: tableCells,
  roster: userGroup,
  log: clock,
  settings: adjustments,
  add: plus,
  reset: arrowPath,
  clear: trash,
  print: printer,
  mobile: devicePhone,
  close: xMark,
  alert: exclamation,
  terrain: paintBrush,
  external: arrowUpRight,
};

/** @returns {SVGElement} um nó novo a cada chamada — SVG não pode ser compartilhado */
export function icon(name) {
  const markup = ICONS[name];
  if (!markup) throw new Error(`Ícone desconhecido: ${name}`);
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  const svg = template.content.firstElementChild;
  svg.classList.add('icon');
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  return svg;
}

/** Preenche `[data-icon]` do HTML estático, preservando o texto do botão. */
export function hydrateIcons(root = document) {
  for (const node of root.querySelectorAll('[data-icon]')) {
    if (node.querySelector('svg.icon')) continue;
    node.prepend(icon(node.dataset.icon));
  }
}
