/** Статический сервер для dist/. Хватает http из стандартной библиотеки. */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
};

async function resolve(root, urlPath) {
  // normalize + отсечение ../ — иначе запрос вылезает за пределы dist
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  const candidates = [join(root, clean)];
  if (!extname(clean)) candidates.push(join(root, clean, 'index.html'));

  for (const file of candidates) {
    try {
      const st = await stat(file);
      if (st.isFile()) return file;
    } catch { /* пробуем следующий */ }
  }
  return null;
}

export function serve(root, port, { onRequest } = {}) {
  const server = createServer(async (req, res) => {
    onRequest?.();
    const file = await resolve(root, req.url);

    if (!file) {
      const notFound = await resolve(root, '/404.html');
      const body = notFound ? await readFile(notFound) : 'Not found';
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(body);
      return;
    }

    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(await readFile(file));
  });

  return new Promise((done) => {
    server.listen(port, '127.0.0.1', () => done(server));
  });
}
