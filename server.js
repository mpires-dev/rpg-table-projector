/**
 * Servidor estático para o build de produção.
 *
 * Escrito à mão em cima do http nativo: o app inteiro são arquivos estáticos, e
 * uma dependência a mais aqui seria uma superfície de atualização de segurança
 * para nada. São ~60 linhas e nenhum node_modules em produção.
 */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const PORT = Number(process.env.PORT) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.map': 'application/json; charset=utf-8',
};

/* ------------------------------------------------------------------ ponte
   O console do mestre publica aqui quem está em cada casa; quem quiser
   acompanhar (o painel do ESP32, hoje) fica pendurado no SSE.

   Estado em memória de propósito: é a foto da mesa agora, não um histórico.
   Se o serviço reiniciar no meio da sessão, a próxima publicação do console
   reconstrói tudo em menos de um segundo.
   ------------------------------------------------------------------------ */

let boardState = { updatedAt: 0, pieces: [] };
let lastDiag = null;

/**
 * O mapa mora aqui, e não no navegador, porque agora há dois pintores: o
 * console e o painel na mesa. Quem chegar depois pega o mapa de quem já pintou.
 * `terrainVersion` é como cada cliente sabe que precisa se atualizar sem
 * comparar o mapa inteiro.
 */
let terrain = {};
let terrainVersion = 0;

const TERRENOS = new Set(['normal', 'difficult', 'water', 'lava', 'wall', 'objective']);
/** Últimos avisos do navegador do mestre — erros de JS e sinais de vida. */
const clientLog = [];

function pushClientLog(entry) {
  clientLog.unshift({ ...entry, em: new Date().toISOString() });
  if (clientLog.length > 25) clientLog.length = 25;
}
/** @type {Set<import('node:http').ServerResponse>} */
const listeners = new Set();

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function estadoCompleto() {
  return { ...boardState, terrain, terrainVersion };
}

function broadcast() {
  const frame = `data: ${JSON.stringify(estadoCompleto())}\n\n`;
  for (const listener of listeners) {
    // Um cliente morto não pode derrubar a publicação dos outros.
    try {
      listener.write(frame);
    } catch {
      listeners.delete(listener);
    }
  }
}

function readBody(request, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('body grande demais'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

async function handleApi(request, response, pathname) {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, CORS).end();
    return true;
  }

  if (pathname === '/api/terrain' && request.method === 'POST') {
    try {
      const parsed = JSON.parse(await readBody(request));

      if (parsed && typeof parsed.terrain === 'object' && parsed.terrain !== null) {
        // Mapa inteiro (o console sincronizando, ou "limpar mapa").
        terrain = {};
        for (const [chave, tipo] of Object.entries(parsed.terrain)) {
          if (/^[0-5],[0-5]$/.test(chave) && TERRENOS.has(tipo) && tipo !== 'normal') {
            terrain[chave] = tipo;
          }
        }
      } else {
        // Uma casa só (uma pincelada, do console ou do painel).
        const { row, col, type } = parsed || {};
        if (!Number.isInteger(row) || !Number.isInteger(col) ||
            row < 0 || row > 5 || col < 0 || col > 5 || !TERRENOS.has(type)) {
          throw new Error('casa ou terreno invalido');
        }
        const chave = `${row},${col}`;
        if (type === 'normal') delete terrain[chave];
        else terrain[chave] = type;
      }

      terrainVersion++;
      broadcast();
      console.log(`[mapa] v${terrainVersion}, ${Object.keys(terrain).length} casa(s) pintada(s)`);
      response.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ok: true, terrainVersion, terrain }));
    } catch (error) {
      response.writeHead(400, { ...CORS, 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ok: false, erro: String(error.message || error) }));
    }
    return true;
  }

  if (pathname === '/api/log' && request.method === 'POST') {
    try {
      const parsed = JSON.parse(await readBody(request, 8 * 1024));
      pushClientLog({
        tipo: String(parsed?.tipo || 'info').slice(0, 40),
        texto: String(parsed?.texto || '').slice(0, 500),
      });
      console.log('[cliente]', parsed?.tipo, String(parsed?.texto || '').slice(0, 200));
    } catch {
      // um relatório malformado não merece derrubar nada
    }
    response.writeHead(204, CORS).end();
    return true;
  }

  if (pathname === '/api/health' && request.method === 'GET') {
    // Diagnóstico da apresentação: diz se o painel chegou até aqui, sem
    // precisar de cabo serial preso na placa.
    response.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
    response.end(
      JSON.stringify({
        ok: true,
        ouvintesSSE: listeners.size,
        pecas: boardState.pieces.length,
        ultimaPublicacao: boardState.updatedAt
          ? new Date(boardState.updatedAt).toISOString()
          : null,
        segundosDesdeAPublicacao: boardState.updatedAt
          ? Math.round((Date.now() - boardState.updatedAt) / 1000)
          : null,
        camera: lastDiag,
        terrenoVersao: terrainVersion,
        casasPintadas: Object.keys(terrain).length,
        avisos: clientLog,
      })
    );
    return true;
  }

  if (pathname === '/api/state' && request.method === 'GET') {
    response.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(estadoCompleto()));
    return true;
  }

  if (pathname === '/api/state' && request.method === 'POST') {
    try {
      const parsed = JSON.parse(await readBody(request));
      boardState = {
        updatedAt: Date.now(),
        pieces: Array.isArray(parsed?.pieces) ? parsed.pieces.slice(0, 24) : [],
      };
      // O diagnóstico não vai para o painel: ele fica no /api/health, para
      // olhar de longe o que a câmera do outro lado está vendo.
      lastDiag = parsed?.diag ?? null;
      broadcast();
      console.log(`[estado] ${boardState.pieces.length} peca(s)`, JSON.stringify(lastDiag || {}));
      response.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
      // A resposta devolve o mapa: é assim que o console descobre uma pincelada
      // dada no painel, sem precisar de um canal só para isso.
      response.end(
        JSON.stringify({ ok: true, pieces: boardState.pieces.length, terrainVersion, terrain })
      );
    } catch (error) {
      response.writeHead(400, { ...CORS, 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ok: false, erro: String(error.message || error) }));
    }
    return true;
  }

  if (pathname === '/api/events' && request.method === 'GET') {
    response.writeHead(200, {
      ...CORS,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Sem isto um proxy pode segurar o fluxo esperando encher um buffer.
      'X-Accel-Buffering': 'no',
    });
    response.write('retry: 3000\n\n');
    response.write(`data: ${JSON.stringify(estadoCompleto())}\n\n`);

    listeners.add(response);
    // Comentário SSE a cada 15s: mantém a conexão viva no proxy do Railway e
    // avisa o firmware que o servidor continua lá mesmo sem ninguém se mexer.
    const ping = setInterval(() => {
      try {
        response.write(': ping\n\n');
      } catch {
        clearInterval(ping);
        listeners.delete(response);
      }
    }, 15000);

    request.on('close', () => {
      clearInterval(ping);
      listeners.delete(response);
    });
    return true;
  }

  return false;
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (requestUrl.pathname.startsWith('/api/')) {
    if (await handleApi(request, response, requestUrl.pathname)) return;
    response.writeHead(404, { ...CORS, 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ ok: false, erro: 'rota não encontrada' }));
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end('Method Not Allowed');
    return;
  }

  const url = requestUrl;
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';

  // normalize resolve os ".." antes da checagem: sem isso, /../ sairia do dist.
  const filePath = join(ROOT, normalize(pathname));
  if (!filePath.startsWith(ROOT + sep) && filePath !== join(ROOT, 'index.html')) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('not a file');

    const ext = extname(filePath);
    // Os assets do Vite têm hash no nome: podem ser cacheados para sempre.
    // O HTML, não — é ele que aponta para o hash novo depois de um deploy.
    const immutable = filePath.includes(`${sep}assets${sep}`);

    response.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': immutable
        ? 'public, max-age=31536000, immutable'
        : 'no-cache, must-revalidate',
    });

    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }).end(
      '<!doctype html><meta charset="utf-8"><title>404</title>' +
        '<p style="font:16px system-ui;padding:40px">Página não encontrada. ' +
        '<a href="/">Voltar ao console</a>.</p>'
    );
  }
});

server.listen(PORT, () => {
  console.log(`Mesa AR servindo ${ROOT} na porta ${PORT}`);
});
