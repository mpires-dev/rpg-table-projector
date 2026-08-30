/**
 * O <video> é exibido com object-fit: cover, então a imagem é cortada nas
 * bordas. Sem reproduzir esse corte, o overlay desenha alguns por cento fora
 * do lugar — o suficiente para o anel não encostar na peça. Esta classe faz a
 * conversão coordenada-do-frame → pixel-de-tela.
 */
export class Viewport {
  constructor() {
    this.originX = 0;
    this.originY = 0;
    this.frameWidth = 1; // largura do vídeo já escalada para a tela, em px do canvas
    this.mirrored = false;
    this.dpr = 1;
    this.width = 1;
    this.height = 1;
  }

  /** Ajusta o canvas ao tamanho real em pixels e devolve as dimensões. */
  _resize(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2); // acima de 2x é só custo
    const pixelWidth = Math.round((canvas.clientWidth || 1) * dpr);
    const pixelHeight = Math.round((canvas.clientHeight || 1) * dpr);

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    this.dpr = dpr;
    this.width = pixelWidth;
    this.height = pixelHeight;
    return { pixelWidth, pixelHeight };
  }

  /**
   * Encaixa uma área com proporção fixa dentro do canvas, centralizada e com
   * tarja preta em volta. É como o preview mostra o formato real da tela do
   * projetor dentro de um painel de tamanho qualquer.
   * @param {number} aspect altura/largura da área
   */
  measureBox(canvas, aspect) {
    const { pixelWidth, pixelHeight } = this._resize(canvas);
    this.mirrored = false;

    const boxWidth = Math.min(pixelWidth, pixelHeight / aspect);
    const boxHeight = boxWidth * aspect;
    this.frameWidth = boxWidth;
    this.originX = (pixelWidth - boxWidth) / 2;
    this.originY = (pixelHeight - boxHeight) / 2;
    return { x: this.originX, y: this.originY, width: boxWidth, height: boxHeight };
  }

  /** @param {HTMLCanvasElement} canvas @param {HTMLVideoElement} video */
  measure(canvas, video, mirrored = false) {
    const { pixelWidth, pixelHeight } = this._resize(canvas);
    this.mirrored = mirrored;

    const vw = video.videoWidth || pixelWidth;
    const vh = video.videoHeight || pixelHeight;
    const scale = Math.max(pixelWidth / vw, pixelHeight / vh); // cover
    const drawnWidth = vw * scale;
    const drawnHeight = vh * scale;

    this.frameWidth = drawnWidth;
    this.originX = (pixelWidth - drawnWidth) / 2;
    this.originY = (pixelHeight - drawnHeight) / 2;
  }

  toScreenX(nx) {
    return this.mirrored
      ? this.originX + this.frameWidth - nx * this.frameWidth
      : this.originX + nx * this.frameWidth;
  }

  toScreenY(ny) {
    return this.originY + ny * this.frameWidth;
  }

  /** converte um comprimento normalizado (ex.: track.size) para px de tela */
  toScreenLength(n) {
    return n * this.frameWidth;
  }

  /**
   * Retângulo visível em coordenadas normalizadas. Com object-fit: cover parte
   * do frame fica fora da tela, então quem precisa posicionar coisas "na tela"
   * (o modo simulação) tem que perguntar aqui, não assumir 0..1.
   */
  visibleBounds() {
    return {
      minX: -this.originX / this.frameWidth,
      maxX: (this.width - this.originX) / this.frameWidth,
      minY: -this.originY / this.frameWidth,
      maxY: (this.height - this.originY) / this.frameWidth,
    };
  }

  /** caminho inverso: toque na tela → coordenada normalizada (usado na simulação) */
  toNormalized(clientX, clientY, canvas) {
    const rect = canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * this.dpr;
    const py = (clientY - rect.top) * this.dpr;
    const nx = this.mirrored
      ? (this.originX + this.frameWidth - px) / this.frameWidth
      : (px - this.originX) / this.frameWidth;
    return { nx, ny: (py - this.originY) / this.frameWidth };
  }
}
