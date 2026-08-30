import { AR } from './aruco.js';
import { Roster } from './roster.js';

const roster = new Roster();
const sheet = document.getElementById('sheet');
const inputs = {
  dictionary: document.getElementById('dictionary'),
  from: document.getElementById('from'),
  to: document.getElementById('to'),
  size: document.getElementById('size'),
};

function render() {
  const name = inputs.dictionary.value;
  const dictionary = new AR.Dictionary(name);
  const max = dictionary.codeList.length - 1;

  const from = clamp(Number(inputs.from.value), 0, max);
  const to = clamp(Number(inputs.to.value), from, Math.min(max, from + 63));
  const sizeMm = clamp(Number(inputs.size.value), 10, 200);

  inputs.from.max = String(max);
  inputs.to.max = String(max);

  sheet.innerHTML = '';
  for (let id = from; id <= to; id++) {
    sheet.appendChild(buildMarker(dictionary, id, sizeMm));
  }

  document.getElementById('rosterNote').textContent =
    `Dicionário com ${max + 1} IDs (0 a ${max}). Mostrando ${to - from + 1}.`;
}

function buildMarker(dictionary, id, sizeMm) {
  const wrapper = document.createElement('div');
  wrapper.className = 'marker';
  wrapper.innerHTML = dictionary.generateSVG(id);

  const svg = wrapper.querySelector('svg');
  // O SVG do js-aruco2 já vem com 1 módulo de borda branca em volta do preto —
  // essa borda é o que o detector procura, então ela conta no tamanho impresso.
  svg.setAttribute('width', `${sizeMm}mm`);
  svg.setAttribute('height', `${sizeMm}mm`);
  svg.setAttribute('shape-rendering', 'crispEdges');

  const entry = roster.get(id);
  const caption = document.createElement('div');
  caption.className = 'caption';
  caption.textContent = entry.unregistered ? `ID ${id}` : `ID ${id} · ${entry.name}`;
  wrapper.appendChild(caption);
  return wrapper;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

for (const input of Object.values(inputs)) {
  input.addEventListener('change', render);
  input.addEventListener('input', render);
}

document.getElementById('printBtn').addEventListener('click', () => window.print());

render();
