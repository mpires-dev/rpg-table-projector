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

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end('Method Not Allowed');
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
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
