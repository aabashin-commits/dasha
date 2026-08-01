/** Просмотр собранного dist/ без пересборки. */

import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './lib/server.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 4321;

if (!existsSync(DIST)) {
  console.error('✗ Нет dist/. Сначала npm run build');
  process.exit(1);
}

await serve(DIST, PORT);
console.log(`▸ http://127.0.0.1:${PORT}`);
