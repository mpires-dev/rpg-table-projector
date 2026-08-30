import { FrameDetector } from './detectCore.js';

/**
 * Fachada da detecção. Tenta rodar num Web Worker com OffscreenCanvas; onde isso
 * não existe, cai para a thread principal sem que o resto do app perceba.
 *
 * Só existe um frame em voo por vez: se a detecção ainda não voltou, o frame
 * novo é descartado. Enfileirar frames só faria a posição projetada atrasar cada
 * vez mais em relação à peça de verdade.
 */
export class DetectorClient {
  constructor(config = {}) {
    this.config = {
      dictionaryName: 'ARUCO_MIP_36h12',
      maxHammingDistance: 3,
      minMarkerSize: 0.035,
      procWidth: 480,
      ...config,
    };

    this.mode = 'main';
    this.worker = null;
    this.pending = null;
    this.nextId = 1;
    this.lastMs = 0;

    this.fallback = null;
    this.canvas = null;
    this.ctx = null;

    this._startWorker();
  }

  _startWorker() {
    const supported =
      typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
    if (!supported) return;

    try {
      this.worker = new Worker(new URL('./detector.worker.js', import.meta.url), {
        type: 'module',
      });
      this.worker.onmessage = (event) => {
        const { id, markers, ms } = event.data;
        if (this.pending?.id !== id) return;
        this.lastMs = ms;
        this.pending.resolve(markers);
        this.pending = null;
      };
      this.worker.onerror = () => this._degrade();
      this.worker.postMessage({ type: 'config', config: this.config });
      this.mode = 'worker';
    } catch {
      this._degrade();
    }
  }

  /** Worker morreu ou nem nasceu: segue na thread principal. */
  _degrade() {
    this.worker?.terminate();
    this.worker = null;
    this.mode = 'main';
    this.pending?.resolve([]);
    this.pending = null;
  }

  configure(partial = {}) {
    Object.assign(this.config, partial);
    if (this.worker) this.worker.postMessage({ type: 'config', config: this.config });
    this.fallback?.configure(this.config);
  }

  get busy() {
    return Boolean(this.pending);
  }

  /**
   * @param {HTMLVideoElement} video
   * @returns {Promise<Array|null>} null quando o frame foi descartado por
   *   já existir uma detecção em andamento
   */
  async detect(video) {
    if (!video?.videoWidth) return null;
    if (this.pending) return null;

    if (this.mode === 'worker') {
      let bitmap;
      try {
        bitmap = await createImageBitmap(video);
      } catch {
        this._degrade();
        return this._detectOnMainThread(video);
      }

      return new Promise((resolve) => {
        const id = this.nextId++;
        this.pending = { id, resolve };
        this.worker.postMessage({ type: 'frame', bitmap, id }, [bitmap]);
      });
    }

    return this._detectOnMainThread(video);
  }

  _detectOnMainThread(video) {
    if (!this.fallback) this.fallback = new FrameDetector(this.config);
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    }

    const started = performance.now();
    const width = Math.min(this.config.procWidth, video.videoWidth);
    const height = Math.max(1, Math.round((width * video.videoHeight) / video.videoWidth));

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    this.ctx.drawImage(video, 0, 0, width, height);
    const markers = this.fallback.detect(this.ctx.getImageData(0, 0, width, height));
    this.lastMs = performance.now() - started;
    return markers;
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.pending = null;
  }
}
