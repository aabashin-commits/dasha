/**
 * Скачивает woff2 с Google Fonts и генерирует локальный @font-face.
 *
 * Зачем локально, а не через CDN: у российской аудитории обращения к
 * fonts.gstatic.com нестабильны, и текст на четверти загрузок остаётся
 * в системном шрифте. Плюс сторонний домен — это лишний DNS + TLS
 * в критическом пути рендера.
 *
 * Запускается один раз; результат коммитится. Перезапуск нужен, только
 * если меняется состав гарнитур или начертаний.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONT_DIR = join(ROOT, 'public/fonts');
const CSS_OUT = join(ROOT, 'src/styles/fonts.css');

// UA современного Chrome — иначе Google отдаёт ttf вместо woff2
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const FAMILIES = [
  { name: 'Unbounded', weights: [500, 700], varName: 'display' },
  { name: 'Golos Text', weights: [400, 500], varName: 'body' },
  { name: 'IBM Plex Mono', weights: [400, 500], varName: 'mono' },
];

// Берём только нужные подмножества: латиница для технических подписей,
// кириллица для всего остального. cyrillic-ext и vietnamese не нужны.
const KEEP = ['cyrillic', 'latin'];

async function fetchCss(family, weights) {
  const q = `${family.replace(/ /g, '+')}:wght@${weights.join(';')}`;
  const url = `https://fonts.googleapis.com/css2?family=${q}&display=swap`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${family}: Google ответил ${res.status}`);
  return res.text();
}

/** Разбирает ответ Google на блоки: подмножество, вес, url, unicode-range. */
function parseBlocks(css) {
  const blocks = [];
  const re = /\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]+)\}/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    const [, subset, body] = m;
    const weight = body.match(/font-weight:\s*(\d+)/)?.[1];
    const src = body.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
    const range = body.match(/unicode-range:\s*([^;]+)/)?.[1]?.trim();
    if (subset && weight && src) blocks.push({ subset, weight, src, range });
  }
  return blocks;
}

async function main() {
  mkdirSync(FONT_DIR, { recursive: true });
  mkdirSync(dirname(CSS_OUT), { recursive: true });
  const out = [
    '/* Сгенерировано scripts/fetch-fonts.js — вручную не править. */',
    '/* Локальные woff2: CDN Google нестабилен у РФ-аудитории. */',
    '',
  ];
  let count = 0;

  for (const fam of FAMILIES) {
    const css = await fetchCss(fam.name, fam.weights);
    const blocks = parseBlocks(css).filter((b) => KEEP.includes(b.subset));

    if (blocks.length === 0) throw new Error(`${fam.name}: не нашлось нужных подмножеств`);

    for (const b of blocks) {
      const slug = fam.name.toLowerCase().replace(/ /g, '-');
      const file = `${slug}-${b.weight}-${b.subset}.woff2`;
      const res = await fetch(b.src, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`${file}: скачивание вернуло ${res.status}`);
      writeFileSync(join(FONT_DIR, file), Buffer.from(await res.arrayBuffer()));
      count++;

      out.push(`@font-face{`);
      out.push(`  font-family:'${fam.name}';`);
      out.push(`  font-style:normal;`);
      out.push(`  font-weight:${b.weight};`);
      out.push(`  font-display:swap;`);
      out.push(`  src:url('/fonts/${file}') format('woff2');`);
      if (b.range) out.push(`  unicode-range:${b.range};`);
      out.push(`}`);
    }
    console.log(`  ${fam.name}: ${blocks.length} файлов`);
  }

  writeFileSync(CSS_OUT, out.join('\n') + '\n');
  console.log(`✓ Шрифты локально: ${count} woff2 → public/fonts/, описания → src/styles/fonts.css`);
}

main().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
