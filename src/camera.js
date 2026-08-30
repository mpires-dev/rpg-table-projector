/**
 * Câmera do celular. Nada aqui funciona em http:// — só https ou localhost.
 */
export class Camera {
  constructor(videoEl) {
    this.video = videoEl;
    this.stream = null;
    this.facingMode = 'environment';
    this.track = null;
  }

  get isRunning() {
    return Boolean(this.stream);
  }

  /** true quando estamos usando a câmera frontal e a imagem precisa ser espelhada */
  get mirrored() {
    return this.facingMode === 'user';
  }

  async start(facingMode = this.facingMode) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        'Este navegador não expõe a câmera. Abra em https:// (ou localhost) num navegador moderno.'
      );
    }
    this.stop();
    this.facingMode = facingMode;

    // Pedimos 1280x720: resolução alta ajuda a ler o marcador de longe, e a
    // detecção roda numa cópia reduzida mesmo, então não custa caro.
    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      },
    };

    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.track = this.stream.getVideoTracks()[0] || null;
    this.video.srcObject = this.stream;
    this.video.setAttribute('playsinline', ''); // sem isso o iOS abre em fullscreen nativo
    await this.video.play();
    await this._waitForDimensions();
    return this.stream;
  }

  stop() {
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
    }
    this.stream = null;
    this.track = null;
    this.video.srcObject = null;
  }

  async flip() {
    return this.start(this.facingMode === 'environment' ? 'user' : 'environment');
  }

  get supportsTorch() {
    return Boolean(this.track?.getCapabilities?.().torch);
  }

  async setTorch(on) {
    if (!this.supportsTorch) return false;
    try {
      await this.track.applyConstraints({ advanced: [{ torch: on }] });
      return true;
    } catch {
      return false;
    }
  }

  _waitForDimensions() {
    if (this.video.videoWidth) return Promise.resolve();
    return new Promise((resolve) => {
      this.video.addEventListener('loadedmetadata', () => resolve(), { once: true });
    });
  }
}
