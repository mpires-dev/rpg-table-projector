/**
 * Canal entre a janela de controle (câmera) e a janela de projeção.
 *
 * Usa BroadcastChannel, que só conversa dentro da MESMA origem — mesmo
 * protocolo, host e porta. Por isso as duas telas são duas rotas do mesmo
 * servidor, e não dois servidores em portas diferentes.
 *
 * Se um dia a câmera for o celular e a projeção o notebook, é só esta classe que
 * muda: mesma API por cima de um WebSocket.
 */
export class Bus {
  constructor(channelName = 'rpg-ar') {
    this.handlers = new Map();
    this.channel = null;

    if (typeof BroadcastChannel === 'undefined') {
      console.warn('BroadcastChannel indisponível: as duas janelas não vão se falar.');
      return;
    }

    this.channel = new BroadcastChannel(channelName);
    this.channel.onmessage = (event) => {
      const message = event.data;
      if (!message?.type) return;
      for (const handler of this.handlers.get(message.type) || []) {
        handler(message.payload, message);
      }
    };
  }

  get available() {
    return Boolean(this.channel);
  }

  send(type, payload) {
    this.channel?.postMessage({ type, payload, ts: Date.now() });
  }

  /** @returns {() => void} função para cancelar a inscrição */
  on(type, handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  close() {
    this.channel?.close();
    this.channel = null;
    this.handlers.clear();
  }
}
