/**
 * Генерация изображений-заглушек.
 *
 * Читает content/*.json и создаёт ровно те файлы, на которые ссылается контент.
 * Сцены повторяют композиции из прототипа: у каждой есть жёсткая грань —
 * луч, горизонт или контур, — иначе градиент читается как размытие, а не кадр.
 *
 * Смысл в том, чтобы разметка с первого дня работала с настоящими <picture>,
 * width, height и alt. Приход реальных фото должен быть заменой файлов,
 * а не правкой шаблонов.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { readJson } from './validate-content.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');

/* ---------- Сцены ---------- */

const SCENES = [
  { // 0 — контровой свет сцены
    base: ['#3A171C', '#0B0708'], angle: 166,
    blobs: [['20%', '24%', '30%', '#FF7A44', 0.9], ['58%', '100%', '70%', '#74203A', 0.75]],
    bands: [[194, 0.28, 0.41, 'rgba(255,150,90,.5)'], [172, 0.5, 0.6, 'rgba(255,190,110,.34)']],
  },
  { // 1 — свет из окна
    base: ['#3A3128', '#090807'], angle: 198,
    blobs: [['24%', '58%', '46%', '#FFF3D6', 0.26]],
    bands: [[108, 0.06, 0.19, 'rgba(255,244,220,.95)'], [108, 0.24, 0.33, 'rgba(255,240,208,.62)']],
  },
  { // 2 — ночная улица
    base: ['#123340', '#05090C'], angle: 148,
    blobs: [['31%', '23%', '8%', '#FFDDA0', 1], ['42%', '31%', '6%', '#FFBE78', 1],
            ['79%', '60%', '40%', '#2EC7E0', 0.66]],
    bands: [],
  },
  { // 3 — жёсткий горизонт
    base: ['#141D19', '#070A09'], angle: 6,
    blobs: [['46%', '36%', '40%', '#D4E2E8', 0.42]],
    horizon: { at: 0.66, below: '#1A241F', above: 'rgba(158,184,198,.52)' },
    bands: [],
  },
  { // 4 — золотой час
    base: ['#4C2B1C', '#0B0705'], angle: 202,
    blobs: [['69%', '33%', '17%', '#FFE0AE', 1], ['63%', '40%', '57%', '#FFA856', 0.56]],
    horizon: { at: 0.76, below: 'rgba(18,11,8,.96)', above: 'transparent' },
    bands: [],
  },
  { // 5 — сценический свет
    base: ['#251E3C', '#07060D'], angle: 158,
    blobs: [['38%', '40%', '32%', '#AD90FF', 0.9], ['79%', '76%', '36%', '#4FA8D0', 0.62]],
    bands: [[200, 0.24, 0.38, 'rgba(160,130,240,.42)']],
  },
];

/** Устойчивый выбор сцены по слагу: одна и та же работа всегда одного цвета. */
function sceneFor(key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return SCENES[h % SCENES.length];
}

function sceneSvg(sc, w, h) {
  const defs = [];
  const shapes = [];

  defs.push(`<linearGradient id="base" gradientTransform="rotate(${sc.angle - 90} .5 .5)">
    <stop offset="0" stop-color="${sc.base[0]}"/><stop offset=".8" stop-color="${sc.base[1]}"/>
  </linearGradient>`);
  shapes.push(`<rect width="${w}" height="${h}" fill="url(#base)"/>`);

  if (sc.horizon) {
    const y = h * sc.horizon.at;
    shapes.push(`<rect y="${y}" width="${w}" height="${h - y}" fill="${sc.horizon.below}"/>`);
    if (sc.horizon.above !== 'transparent') {
      defs.push(`<linearGradient id="hz" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stop-color="${sc.horizon.above}"/>
        <stop offset="1" stop-color="${sc.horizon.above}" stop-opacity="0"/>
      </linearGradient>`);
      shapes.push(`<rect y="${y - h * 0.24}" width="${w}" height="${h * 0.24}" fill="url(#hz)"/>`);
    }
  }

  // Луч света: жёсткая кромка с одной стороны, затухание к другой.
  // Сплошная заливка читается как плоская нашлёпка, а не как свет.
  sc.bands?.forEach(([angle, from, to, color], i) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    const len = Math.hypot(w, h) * 1.6;
    const cx = w / 2, cy = h / 2;
    const mid = (from + to) / 2 - 0.5;
    const ox = Math.cos(rad) * len * mid, oy = Math.sin(rad) * len * mid;
    const thick = len * (to - from) * 0.75;

    defs.push(`<linearGradient id="bd${i}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity="0"/>
      <stop offset=".07" stop-color="${color}" stop-opacity=".55"/>
      <stop offset=".38" stop-color="${color}" stop-opacity=".22"/>
      <stop offset="1" stop-color="${color}" stop-opacity="0"/>
    </linearGradient>`);

    shapes.push(
      `<g transform="translate(${cx + ox} ${cy + oy}) rotate(${angle - 90})">
         <rect x="${-len / 2}" y="${-thick / 2}" width="${len}" height="${thick}" fill="url(#bd${i})"/>
       </g>`
    );
  });

  sc.blobs.forEach(([x, y, r, color, op], i) => {
    defs.push(`<radialGradient id="b${i}">
      <stop offset="0" stop-color="${color}" stop-opacity="${op}"/>
      <stop offset="1" stop-color="${color}" stop-opacity="0"/>
    </radialGradient>`);
    const rr = (parseFloat(r) / 100) * Math.max(w, h);
    shapes.push(`<ellipse cx="${(parseFloat(x) / 100) * w}" cy="${(parseFloat(y) / 100) * h}"
      rx="${rr}" ry="${rr * (h / w) * 1.3}" fill="url(#b${i})"/>`);
  });

  // Виньетка — она и делает поверхность фотографической
  defs.push(`<radialGradient id="vig">
    <stop offset=".34" stop-color="#060708" stop-opacity="0"/>
    <stop offset="1" stop-color="#060708" stop-opacity=".72"/>
  </radialGradient>`);
  shapes.push(`<ellipse cx="${w / 2}" cy="${h * 0.46}" rx="${w * 0.72}" ry="${h * 0.88}" fill="url(#vig)"/>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>${defs.join('')}</defs>${shapes.join('')}
  </svg>`;
}

/* ---------- Запись ---------- */

const RATIO = { '9:16': 9 / 16, '16:9': 16 / 9, '2.39:1': 2.39, '1.66:1': 1.66, '4:3': 4 / 3, '1:1': 1 };
let written = 0;

async function emit(path, key, w, h, sceneIndex, widths = []) {
  const abs = join(PUBLIC, path);
  mkdirSync(dirname(abs), { recursive: true });
  const scene = sceneIndex === undefined ? sceneFor(key) : SCENES[sceneIndex % SCENES.length];
  const svg = Buffer.from(sceneSvg(scene, w, h));

  // resize обязателен: sharp растрирует SVG исходя из density, а не из
  // атрибутов width/height, и без него картинки выходят в 1.33 раза крупнее
  const write = async (file, width) => {
    const height = Math.round((width / w) * h);
    const img = sharp(svg).resize(width, height, { fit: 'fill' });
    await img.clone().jpeg({ quality: 82, mozjpeg: true }).toFile(file);
    await img.clone().webp({ quality: 80 }).toFile(file.replace(/\.jpg$/, '.webp'));
    written += 2;
  };

  await write(abs, w);

  // Узкие варианты для srcset: отдавать телефону кадр в 1920px —
  // это секунды LCP на медленной сети
  for (const width of widths) {
    if (width >= w) continue;
    await write(abs.replace(/\.jpg$/, `-${width}.jpg`), width);
  }
}

/** Ширина фиксирована, высота выводится из соотношения — так работает вёрстка. */
function box(ratio, width = 1600) {
  const r = RATIO[ratio] ?? 16 / 9;
  return [width, Math.round(width / r)];
}

async function main() {
  const works = readJson('works');
  const services = readJson('services');
  const journal = readJson('journal');
  const team = readJson('team');
  const clients = readJson('clients');
  const site = readJson('site');

  for (const w of works) {
    const [pw, ph] = box(w.ratio);
    await emit(w.poster, w.slug, pw, ph, undefined, [480, 800, 1200]);
    for (const [i, g] of (w.gallery ?? []).entries()) {
      await emit(g.src, `${w.slug}-${i}`, 1600, 900);
    }
    await emit(`/media/og/${w.slug}.jpg`, w.slug, 1200, 630);
  }

  for (const s of services) {
    if (s.heroPoster) await emit(s.heroPoster, s.slug, 1600, 900);
    await emit(`/media/og/${s.slug}.jpg`, s.slug, 1200, 630);
  }

  for (const a of journal) {
    await emit(a.cover, a.slug, 1600, 900);
    await emit(`/media/og/${a.slug}.jpg`, a.slug, 1200, 630);
  }

  for (const [i, p] of team.entries()) await emit(p.photo, `team-${i}`, 800, 1000);

  await emit(site.seo.defaultOgImage, 'keyframe-default', 1200, 630);

  // Кадры героя: пять остановленных кадров вместо автоплей-шоурила.
  // Сцены задаются явно — весь смысл склеек в том, что кадры заведомо разные.
  for (let i = 1; i <= 5; i++) {
    await emit(`/media/hero/shot-${i}.jpg`, `hero-shot-${i}`, 1920, 1080, i - 1, [640, 1024, 1440]);
  }

  // Логотипы клиентов — простые словесные знаки, монохром под грейскейл-стену
  for (const [i, c] of clients.entries()) {
    const abs = join(PUBLIC, c.logo);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="48" viewBox="0 0 200 48">
  <rect width="200" height="48" fill="none"/>
  <text x="100" y="30" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
        font-size="17" font-weight="700" letter-spacing="1.5" fill="#F0F2EE">${c.name.toUpperCase()}</text>
</svg>`);
    written++;
  }

  console.log(`✓ Заглушки готовы: ${written} файлов в public/media/`);
}

main().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
