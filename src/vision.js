import { Camera } from './camera.js';
import { DetectorClient } from './detectorClient.js';
import { MarkerTracker } from './tracker.js';

/**
 * Junta câmera, detector e tracker num objeto só — é o mesmo arranjo no console
 * do mestre e no app de celular.
 *
 * A detecção é assíncrona e o desenho não espera por ela: o loop dispara um
 * frame quando o detector está livre e segue desenhando com as últimas posições
 * conhecidas. É isso que mantém a interface fluida mesmo com a detecção custando
 * 20-30 ms.
 */
export class Vision {
  constructor(videoEl, options = {}) {
    this.camera = new Camera(videoEl);
    this.client = new DetectorClient(options.detector);
    this.tracker = new MarkerTracker(options.tracker);
    this.video = videoEl;

    this.tracks = [];
    this.pending = null;
    this.inFlight = false;
    this.lastDetection = 0;
    this.minIntervalMs = options.minIntervalMs ?? 0;
  }

  get detectMs() {
    return this.client.lastMs;
  }

  get mode() {
    return this.client.mode;
  }

  reset() {
    this.tracker.reset();
    this.tracks = [];
    this.pending = null;
  }

  configure({ detector, tracker } = {}) {
    if (detector) this.client.configure(detector);
    if (tracker) this.tracker.configure(tracker);
  }

  /**
   * @param {number} now performance.now()
   * @param {(id:number)=>boolean} [accept] filtro de IDs aceitos
   * @returns {Array<object>} peças confirmadas
   */
  update(now, accept) {
    if (!this.camera.isRunning || this.video.readyState < 2) {
      this.tracks = [];
      return this.tracks;
    }

    this._pump(now);

    if (this.pending) {
      this.tracks = this.tracker.update(this.pending, now, accept);
      this.pending = null;
    }
    return this.tracks;
  }

  _pump(now) {
    if (this.inFlight) return;
    if (now - this.lastDetection < this.minIntervalMs) return;

    this.inFlight = true;
    this.lastDetection = now;
    this.client
      .detect(this.video)
      .then((markers) => {
        this.inFlight = false;
        if (markers) this.pending = markers;
      })
      .catch(() => {
        this.inFlight = false;
      });
  }

  dispose() {
    this.camera.stop();
    this.client.dispose();
  }
}
