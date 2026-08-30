/**
 * Servidor estático da landing. Mesmo desenho do server.js da raiz: http nativo
 * do Node, sem dependência — o site é um punhado de arquivos, e uma biblioteca
 * aqui seria superfície de atualização de segurança para nada.
 */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT) || 8080;

// O código do próprio servidor não é conteúdo do site.
const BLOQUEADOS = new Set(['/server.js', '/package.json', '/package-lock.json', '/README.md']);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end('Method Not Allowed');
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';

  if (BLOQUEADOS.has(pathname)) {
    response.writeHead(404).end('Not Found');
    return;
  }

  // normalize resolve os ".." antes da checagem: sem isso, /../ sairia da pasta.
  const filePath = join(ROOT, normalize(pathname));
  if (!filePath.startsWith(ROOT)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('not a file');

    const ext = extname(filePath);
    const estatico = ext !== '.html';

    response.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': info.size,
      // Sem hash no nome dos arquivos, o cache longo é só para as imagens e a
      // fonte; HTML, CSS e JS revalidam para um deploy aparecer na hora.
      'Cache-Control': ['.jpg', '.webp', '.png', '.svg', '.woff2'].includes(ext)
        ? 'public, max-age=604800'
        : estatico
          ? 'public, max-age=0, must-revalidate'
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
        '<a href="/">Voltar ao início</a>.</p>'
    );
  }
});

server.listen(PORT, () => {
  console.log(`Combat Maps — landing na porta ${PORT}`);
});
