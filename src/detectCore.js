import { AR } from './aruco.js';

/**
 * Detecção de um frame, isolada do resto para rodar igual no Web Worker e na
 * thread principal (fallback).
 *
 * Aqui moram os filtros que separam marcador de verdade de lixo:
 *
 * 1. **Distância de Hamming baixa.** O dicionário 36h12 tolera até 12 bits
 *    errados, o que é ótimo para robustez e péssimo para falso positivo: qualquer
 *    quadrado escuro com textura vira "alguma peça". Cortar em 3 resolve quase
 *    todo o problema de "apareceram 5 peças e eu mostrei uma".
 * 2. **Tamanho mínimo.** Contorno minúsculo é ruído de compressão, não peça.
 * 3. **Um marcador por ID.** Se o mesmo ID sai duas vezes no frame, o menor é
 *    reflexo ou eco de contorno — fica o maior.
 */
export class FrameDetector {
  constructor(config = {}) {
    this.config = {
      dictionaryName: 'ARUCO_MIP_36h12',
      maxHammingDistance: 3,
      minMarkerSize: 0.035, // fração da largura do frame
      ...config,
    };
    this.detector = null;
    this._rebuild();
  }

  configure(partial = {}) {
    const before = `${this.config.dictionaryName}|${this.config.maxHammingDistance}`;
    Object.assign(this.config, partial);
    if (`${this.config.dictionaryName}|${this.config.maxHammingDistance}` !== before) {
      this._rebuild();
    }
  }

  _rebuild() {
    this.detector = new AR.Detector({
      dictionaryName: this.config.dictionaryName,
      maxHammingDistance: this.config.maxHammingDistance,
    });
  }

  /**
   * @param {ImageData|{width:number,height:number,data:Uint8ClampedArray}} image
   * @returns {Array<{id:number, corners:Array<{x:number,y:number}>, size:number, hamming:number}>}
   *   cantos já normalizados pela largura do frame
   */
  detect(image) {
    const width = image.width;
    const found = this.detector.detect(image);
    const byId = new Map();

    for (const marker of found) {
      if (marker.hammingDistance > this.config.maxHammingDistance) continue;

      const corners = marker.corners.map((c) => ({ x: c.x / width, y: c.y / width }));
      const size = averageSide(corners);
      if (size < this.config.minMarkerSize) continue;

      const previous = byId.get(marker.id);
      if (!previous || size > previous.size) {
        byId.set(marker.id, {
          id: marker.id,
          corners,
          size,
          hamming: marker.hammingDistance,
        });
      }
    }

    return [...byId.values()];
  }
}

function averageSide(corners) {
  let perimeter = 0;
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    perimeter += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return perimeter / 4;
}
