import { FrameDetector } from './detectCore.js';

/**
 * Detecção fora da thread principal. O custo real está em findContours sobre a
 * imagem inteira; tirar isso do main thread é o que mantém a interface e o
 * desenho da projeção em 60 fps enquanto a câmera roda.
 */

const detector = new FrameDetector();
let canvas = null;
let ctx = null;
let procWidth = 480;

self.onmessage = (event) => {
  const message = event.data;

  if (message.type === 'config') {
    detector.configure(message.config);
    if (message.config.procWidth) procWidth = message.config.procWidth;
    return;
  }

  if (message.type === 'frame') {
    const bitmap = message.bitmap;
    const started = performance.now();

    const width = Math.min(procWidth, bitmap.width);
    const height = Math.max(1, Math.round((width * bitmap.height) / bitmap.width));

    if (!canvas || canvas.width !== width || canvas.height !== height) {
      canvas = new OffscreenCanvas(width, height);
      ctx = canvas.getContext('2d', { willReadFrequently: true });
    }

    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const markers = detector.detect(ctx.getImageData(0, 0, width, height));
    self.postMessage({
      type: 'result',
      id: message.id,
      markers,
      ms: performance.now() - started,
    });
  }
};
