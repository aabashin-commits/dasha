/**
 * Dev-сервер: полная пересборка по изменению файла.
 *
 * HMR здесь не нужен и не окупается: HTML генерируется нашим скриптом,
 * а полная сборка пятнадцати страниц занимает меньше 200 мс — быстрее,
 * чем человек успевает переключиться на браузер.
 */

import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import chokidar from 'chokidar';
import { serve } from './lib/server.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 4321;

const WATCH = ['content', 'src', 'public', 'scripts'].map((d) => join(ROOT, d));

let building = false;
let pending = false;

function build() {
  if (building) { pending = true; return; }
  building = true;

  const child = spawn(process.execPath, [join(ROOT, 'scripts/build.js')], {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development' },
  });

  child.on('close', () => {
    building = false;
    if (pending) { pending = false; build(); }
  });
}

await serve(DIST, PORT);
console.log(`▸ http://127.0.0.1:${PORT}  (следим за content/ src/ public/)`);
build();

chokidar
  .watch(WATCH, { ignoreInitial: true, ignored: /node_modules/ })
  .on('all', (_event, path) => {
    console.log(`\n· ${path.replace(ROOT + '/', '')}`);
    build();
  });
