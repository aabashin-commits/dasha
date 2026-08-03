/**
 * Node-мок эндпоинта заявок.
 *
 * PHP локально не установлен, поэтому lead.php нельзя запустить. Этот мок
 * повторяет его контракт: те же коды ответов, та же форма ошибок по полям,
 * та же логика ханипота, метки времени и лимита частоты.
 *
 * Он проверяет фронтенд формы, но НЕ проверяет сам PHP. Логика lead.php
 * остаётся непрогнанной до заливки на хостинг — сценарий боевой проверки
 * в docs/deploy.md.
 *
 * Запуск: npm run mock
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 4322;

const SERVICES = ['reels', 'event-production', 'documentary', 'memory-films'];
const RATE = { limit: 5, window: 600_000 };
const hits = new Map();

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.png': 'image/png', '.woff2': 'font/woff2',
};

/* ---------- Те же правила, что в lib/validate.php ---------- */

const clean = (v) => String(v ?? '')
  .replace(/<[^>]*>/g, '')
  // Управляющие символы кроме перевода строки и табуляции
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  .trim();

const isContact = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)
  || /^@[A-Za-z0-9_]{4,32}$/.test(v)
  || (/^\+?[\d\s()-]{10,18}$/.test(v) && v.replace(/\D/g, '').length >= 10);

function validate(input) {
  const errors = {};
  const data = {
    name: clean(input.name),
    contact: clean(input.contact),
    message: clean(input.message),
    service: SERVICES.includes(clean(input.service)) ? clean(input.service) : '',
  };

  if (!data.name) errors.name = 'Как к вам обращаться?';
  else if (data.name.length < 2) errors.name = 'Слишком коротко';
  else if (data.name.length > 80) errors.name = 'Слишком длинно';

  if (!data.contact) errors.contact = 'Оставьте способ связи';
  else if (!isContact(data.contact)) errors.contact = 'Похоже на опечатку: нужен email, телефон или @username';

  if (data.message.length > 2000) errors.message = 'Не больше 2000 символов';
  if (!input.consent) errors.consent = 'Без согласия на обработку данных отправить нельзя';

  return [errors, data];
}

const isBot = (input) => {
  if (input.company) return true;
  const ts = Number(input.ts) || 0;
  return ts > 0 && Date.now() - ts < 3000;
};

function rateOk(ip) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < RATE.window);
  if (list.length >= RATE.limit) { hits.set(ip, list); return false; }
  list.push(now);
  hits.set(ip, list);
  return true;
}

/* ---------- Сервер ---------- */

const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

async function handleLead(req, res) {
  if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }); res.end(); return; }

  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 20000) { json(res, 413, { ok: false }); return; }
  }

  let input;
  try { input = JSON.parse(raw); } catch { json(res, 400, { ok: false }); return; }

  // Боту отвечаем успехом: сигнал «поле распознано» научил бы его обходить
  if (isBot(input)) {
    console.log('  · отсечён как бот');
    json(res, 200, { ok: true });
    return;
  }

  const ip = req.socket.remoteAddress ?? 'unknown';
  if (!rateOk(ip)) {
    console.log('  · превышен лимит частоты');
    json(res, 429, { ok: false, error: 'Слишком много заявок подряд. Попробуйте через десять минут.' });
    return;
  }

  const [errors, data] = validate(input);
  if (Object.keys(errors).length > 0) {
    console.log('  · ошибки валидации:', Object.keys(errors).join(', '));
    json(res, 422, { ok: false, errors });
    return;
  }

  console.log('  ✓ заявка принята:', data.name, '/', data.contact, data.service ? `/ ${data.service}` : '');
  json(res, 200, { ok: true });
}

async function serveStatic(req, res) {
  const clean = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  const tries = [join(DIST, clean)];
  if (!extname(clean)) tries.push(join(DIST, clean, 'index.html'));

  for (const file of tries) {
    try {
      if (!(await stat(file)).isFile()) continue;
      res.writeHead(200, {
        'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(await readFile(file));
      return;
    } catch { /* дальше */ }
  }
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(await readFile(join(DIST, '404.html')).catch(() => 'Not found'));
}

createServer(async (req, res) => {
  if (req.url.split('?')[0] === '/api/lead.php') {
    console.log(`\n▸ POST /api/lead.php`);
    await handleLead(req, res);
    return;
  }
  await serveStatic(req, res);
}).listen(PORT, '127.0.0.1', () => {
  console.log(`▸ http://127.0.0.1:${PORT}  (мок эндпоинта заявок)`);
  console.log('  Проверяет фронтенд формы. Логику lead.php — только на хостинге.');
});
