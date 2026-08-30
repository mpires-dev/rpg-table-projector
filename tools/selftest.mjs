/**
 * Teste de sanidade sem browser: sintetiza a imagem de um marcador em memória,
 * joga no detector e confere se volta o ID certo no lugar certo.
 *
 * Rode com `npm run selftest` antes de sair caçando bug na câmera — se isto
 * passar, o problema está na captura/iluminação, não na detecção.
 */
import { AR } from '../src/aruco.js';
import { computeHomography, applyHomography } from '../src/homography.js';
import { projectTrack, targetsInProjectorSpace } from '../src/calibration.js';
import { FrameDetector } from '../src/detectCore.js';
import { MarkerTracker } from '../src/tracker.js';
import { boardLayout, cellAt, cellLabel, cellCenter, cellDistance, BOARD_SIZE } from '../src/board.js';

const DICTIONARY = 'ARUCO_MIP_36h12';
const MODULE_PX = 20; // pixels por módulo do marcador
const QUIET = 4; // módulos brancos em volta

function renderMarker(dictionary, id, flipBits = 0) {
  const code = dictionary.codeList[id];
  const dataSize = dictionary.markSize - 2; // 6 para o 36h12
  const total = dictionary.markSize + QUIET * 2;
  const side = total * MODULE_PX;
  const data = new Uint8ClampedArray(side * side * 4);

  const setModule = (mx, my, white) => {
    const value = white ? 255 : 0;
    for (let y = my * MODULE_PX; y < (my + 1) * MODULE_PX; y++) {
      for (let x = mx * MODULE_PX; x < (mx + 1) * MODULE_PX; x++) {
        const i = (y * side + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = value;
        data[i + 3] = 255;
      }
    }
  };

  for (let my = 0; my < total; my++) {
    for (let mx = 0; mx < total; mx++) setModule(mx, my, true);
  }
  // borda preta do marcador
  for (let my = 0; my < dictionary.markSize; my++) {
    for (let mx = 0; mx < dictionary.markSize; mx++) {
      setModule(QUIET + mx, QUIET + my, false);
    }
  }
  // bits de dados
  for (let y = 0; y < dataSize; y++) {
    for (let x = 0; x < dataSize; x++) {
      const index = y * dataSize + x;
      // Inverter os primeiros N bits simula um marcador sujo/rasgado.
      const bit = index < flipBits ? (code[index] === '1' ? '0' : '1') : code[index];
      if (bit === '1') setModule(QUIET + 1 + x, QUIET + 1 + y, true);
    }
  }

  return { width: side, height: side, data };
}

const dictionary = new AR.Dictionary(DICTIONARY);
const detector = new AR.Detector({ dictionaryName: DICTIONARY });

let failures = 0;
for (const id of [0, 1, 5, 42, 249]) {
  const image = renderMarker(dictionary, id);
  const found = detector.detect(image);
  const match = found.find((m) => m.id === id);

  if (!match) {
    failures++;
    console.error(`✗ id ${id}: não detectado (achou: ${found.map((m) => m.id).join(',') || 'nada'})`);
    continue;
  }

  const cx = match.corners.reduce((sum, c) => sum + c.x, 0) / 4;
  const cy = match.corners.reduce((sum, c) => sum + c.y, 0) / 4;
  const expected = image.width / 2;
  const error = Math.hypot(cx - expected, cy - expected);

  if (error > MODULE_PX) {
    failures++;
    console.error(`✗ id ${id}: centro fora do lugar por ${error.toFixed(1)}px`);
  } else {
    console.log(`✓ id ${id} detectado, centro com erro de ${error.toFixed(1)}px`);
  }
}

// --- homografia ------------------------------------------------------------

function checkHomography() {
  // Um quadrilátero em perspectiva (como a mesa é vista pela câmera) mapeado
  // no retângulo da área de projeção.
  const src = [
    { x: 0.21, y: 0.18 },
    { x: 0.79, y: 0.11 },
    { x: 0.93, y: 0.62 },
    { x: 0.14, y: 0.58 },
  ];
  const dst = [
    { x: 0.12, y: 0.12 },
    { x: 0.88, y: 0.12 },
    { x: 0.88, y: 0.68 },
    { x: 0.12, y: 0.68 },
  ];

  const h = computeHomography(src, dst);
  if (!h) {
    console.error('✗ homografia: não convergiu');
    return 1;
  }

  let worst = 0;
  for (let i = 0; i < 4; i++) {
    const got = applyHomography(h, src[i].x, src[i].y);
    worst = Math.max(worst, Math.hypot(got.x - dst[i].x, got.y - dst[i].y));
  }
  if (worst > 1e-9) {
    console.error(`✗ homografia: erro de ${worst.toExponential(2)} nos cantos`);
    return 1;
  }
  console.log(`✓ homografia: cantos batem com erro de ${worst.toExponential(1)}`);

  // Pontos degenerados (três em linha) têm que devolver null, não uma matriz
  // maluca que faria a projeção sair do lugar sem avisar.
  const degenerate = computeHomography(
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }],
    dst
  );
  if (degenerate !== null) {
    console.error('✗ homografia: aceitou 4 pontos colineares');
    return 1;
  }
  console.log('✓ homografia: rejeita pontos colineares');
  return 0;
}

failures += checkHomography();

// --- câmera → projeção -----------------------------------------------------

function checkProjection() {
  // Mesa vista de lado pela câmera: o lado de cima aparece menor que o de baixo.
  const tableInCamera = [
    { x: 0.30, y: 0.22 },
    { x: 0.72, y: 0.22 },
    { x: 0.88, y: 0.64 },
    { x: 0.14, y: 0.64 },
  ];
  const aspect = 1080 / 1920;
  const targets = targetsInProjectorSpace(aspect);
  const matrix = computeHomography(tableInCamera, targets);
  if (!matrix) {
    console.error('✗ projeção: homografia de calibração falhou');
    return 1;
  }

  // Uma peça bem no meio da mesa tem que cair bem no meio da área projetada.
  const center = tableInCamera.reduce(
    (acc, p) => ({ x: acc.x + p.x / 4, y: acc.y + p.y / 4 }),
    { x: 0, y: 0 }
  );
  const half = 0.03;
  const track = {
    id: 1,
    corners: [
      { x: center.x - half, y: center.y - half },
      { x: center.x + half, y: center.y - half },
      { x: center.x + half, y: center.y + half },
      { x: center.x - half, y: center.y + half },
    ],
    visible: true,
    confidence: 1,
  };

  const projected = projectTrack(track, matrix);
  const expected = targets.reduce(
    (acc, p) => ({ x: acc.x + p.x / 4, y: acc.y + p.y / 4 }),
    { x: 0, y: 0 }
  );
  const error = Math.hypot(projected.cx - expected.x, projected.cy - expected.y);

  // O centro do quadrilátero não é o ponto projetado do centro (a perspectiva
  // não preserva médias), então a tolerância é o tamanho de uma peça.
  if (error > projected.size) {
    console.error(`✗ projeção: centro caiu a ${error.toFixed(3)} do esperado`);
    return 1;
  }
  if (!(projected.size > 0)) {
    console.error('✗ projeção: peça projetada ficou sem tamanho');
    return 1;
  }
  console.log(
    `✓ projeção: peça no meio da mesa cai no meio da área (erro ${error.toFixed(3)}, lado ${projected.size.toFixed(3)})`
  );
  return 0;
}

failures += checkProjection();

// --- filtros contra falso positivo -----------------------------------------

function checkFilters() {
  let local = 0;
  const image = renderMarker(dictionary, 7, 5); // 5 bits errados

  const strict = new FrameDetector({ maxHammingDistance: 3, minMarkerSize: 0.01 });
  if (strict.detect(image).length !== 0) {
    console.error('✗ filtro: marcador com 5 bits errados passou pelo corte de Hamming 3');
    local++;
  } else {
    console.log('✓ filtro: Hamming 3 rejeita marcador com 5 bits errados');
  }

  const loose = new FrameDetector({ maxHammingDistance: 12, minMarkerSize: 0.01 });
  if (loose.detect(image).length === 0) {
    console.error('✗ filtro: Hamming 12 deveria aceitar o mesmo marcador sujo');
    local++;
  } else {
    console.log('✓ filtro: Hamming 12 aceita o mesmo marcador (o corte é o que muda)');
  }

  // O marcador sintético ocupa ~44% do frame; exigir 60% tem que rejeitá-lo.
  const tooBig = new FrameDetector({ maxHammingDistance: 3, minMarkerSize: 0.6 });
  if (tooBig.detect(renderMarker(dictionary, 7)).length !== 0) {
    console.error('✗ filtro: tamanho mínimo não foi aplicado');
    local++;
  } else {
    console.log('✓ filtro: tamanho mínimo descarta marcador pequeno demais');
  }
  return local;
}

failures += checkFilters();

// --- tracker: confirmação, filtro de elenco e hold --------------------------

function checkTracker() {
  let local = 0;
  const marker = (id) => ({
    id,
    corners: [
      { x: 0.4, y: 0.4 },
      { x: 0.5, y: 0.4 },
      { x: 0.5, y: 0.5 },
      { x: 0.4, y: 0.5 },
    ],
  });

  const tracker = new MarkerTracker({ confirmFrames: 3, holdMs: 1000, candidateMs: 200 });
  if (tracker.update([marker(1)], 0).length !== 0) {
    console.error('✗ tracker: aceitou peça na primeira aparição');
    local++;
  }
  tracker.update([marker(1)], 16);
  if (tracker.update([marker(1)], 32).length !== 1) {
    console.error('✗ tracker: não confirmou depois de 3 quadros');
    local++;
  } else {
    console.log('✓ tracker: só aceita a peça após 3 quadros seguidos');
  }

  // Oclusão curta mantém a peça; oclusão longa remove.
  if (tracker.update([], 500).length !== 1) {
    console.error('✗ tracker: perdeu a peça durante o hold');
    local++;
  }
  if (tracker.update([], 2000).length !== 0) {
    console.error('✗ tracker: manteve a peça depois do hold');
    local++;
  } else {
    console.log('✓ tracker: segura a peça durante a oclusão e solta depois do hold');
  }

  // Um ID fora do elenco nunca vira peça, mesmo aparecendo sempre.
  const filtered = new MarkerTracker({ confirmFrames: 2 });
  const accept = (id) => id === 1;
  for (let i = 0; i < 5; i++) filtered.update([marker(1), marker(99)], i * 16, accept);
  const ids = filtered.update([marker(1), marker(99)], 100, accept).map((t) => t.id);
  if (ids.length !== 1 || ids[0] !== 1) {
    console.error(`✗ tracker: filtro de elenco falhou (veio ${JSON.stringify(ids)})`);
    local++;
  } else {
    console.log('✓ tracker: ID fora do elenco nunca vira peça');
  }
  return local;
}

failures += checkTracker();

// --- tabuleiro --------------------------------------------------------------

function checkBoard() {
  let local = 0;
  const layout = boardLayout(1080 / 1920);

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const center = cellCenter(row, col, layout);
      const back = cellAt(center.x, center.y, layout);
      if (!back || back.row !== row || back.col !== col) {
        console.error(`✗ tabuleiro: centro de ${cellLabel({ row, col })} não voltou para a mesma casa`);
        local++;
      }
    }
  }
  if (!local) console.log('✓ tabuleiro: as 36 casas fecham a ida e volta centro↔célula');

  if (cellAt(-0.5, 0.2, layout) !== null || cellAt(0.5, 9, layout) !== null) {
    console.error('✗ tabuleiro: ponto fora foi mapeado para uma casa');
    local++;
  } else {
    console.log('✓ tabuleiro: ponto fora da grade devolve null');
  }

  if (cellLabel({ row: 3, col: 2 }) !== 'C4') {
    console.error(`✗ tabuleiro: rótulo errado (${cellLabel({ row: 3, col: 2 })} em vez de C4)`);
    local++;
  } else if (cellDistance({ row: 0, col: 0 }, { row: 1, col: 1 }) !== 1) {
    console.error('✗ tabuleiro: diagonal deveria ser 1 casa');
    local++;
  } else {
    console.log('✓ tabuleiro: rótulos e distância em diagonal corretos');
  }
  return local;
}

failures += checkBoard();

console.log(failures ? `\n${failures} falha(s)` : '\nTudo OK.');
process.exit(failures ? 1 : 0);
