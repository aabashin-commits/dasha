/**
 * Сборка сайта: content/*.json + шаблоны → dist/
 *
 * Порядок: валидация → ассеты → страницы → sitemap → копирование public.
 * Валидация идёт первой намеренно: собирать битый контент бессмысленно.
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync, cpSync } from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

import { render } from './lib/template.js';
import { head, jsonLd } from './lib/seo.js';
import { sitemap, robots } from './lib/sitemap.js';
import { validate, report } from './validate-content.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');
const PUBLIC = join(ROOT, 'public');

const PROD = process.env.NODE_ENV !== 'development';

/* ---------- Шаблоны ---------- */

function loadPartials() {
  const dir = join(SRC, 'templates/partials');
  const out = {};
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    if (extname(f) === '.html') out[basename(f, '.html')] = readFileSync(join(dir, f), 'utf8');
  }
  return out;
}

function loadTemplate(name) {
  const file = join(SRC, 'templates/pages', `${name}.html`);
  if (!existsSync(file)) throw new Error(`нет шаблона src/templates/pages/${name}.html`);
  return readFileSync(file, 'utf8');
}

/* ---------- Ассеты ---------- */

async function buildAssets() {
  const result = await esbuild.build({
    entryPoints: [join(SRC, 'scripts/main.js'), join(SRC, 'styles/main.css')],
    bundle: true,
    minify: PROD,
    format: 'esm',
    target: ['es2022', 'chrome109', 'safari15', 'firefox115'],
    outdir: join(DIST, 'assets'),
    entryNames: PROD ? '[name]-[hash]' : '[name]',
    metafile: true,
    // Шрифты и медиа лежат в public и копируются как есть — esbuild
    // не должен пытаться разрешить эти пути на диске
    external: ['/fonts/*', '/media/*'],
    logLevel: 'silent',
  });

  const assets = { js: '', css: '' };
  for (const out of Object.keys(result.metafile.outputs)) {
    const url = `/assets/${basename(out)}`;
    if (out.endsWith('.js')) assets.js = url;
    if (out.endsWith('.css')) assets.css = url;
  }
  return assets;
}

/* ---------- Страницы ---------- */

/**
 * Список страниц сайта. Каждая запись объявляет свой шаблон, данные
 * и то, какие схемы микроразметки ей нужны.
 *
 * Чекпоинт 1 — главная и стайлгайд. Остальные типы страниц добавляются
 * сюда в чекпоинте 2; шаблоны и данные — единственное, что для этого нужно.
 */
function collectPages(c) {
  const { site, services, works, journal, testimonials, clients, faq, team } = c;

  const byOrder = (a, b) => (a.order ?? 99) - (b.order ?? 99);
  const sortedServices = [...services].sort(byOrder);
  const featured = works.filter((w) => w.featured).sort(byOrder).slice(0, 6);
  const latest = [...journal].sort((a, b) => new Date(b.date) - new Date(a.date));

  const pages = [];

  pages.push({
    url: '/',
    template: 'home',
    title: site.seo.defaultTitle,
    description: site.seo.defaultDescription,
    breadcrumbs: [{ title: 'Главная', url: '/' }],
    faq,
    localBusiness: true,
    priority: '1.0',
    data: {
      services: sortedServices,
      works: decorateWorks(featured, sortedServices),
      journal: decorateJournal(latest.slice(0, 3)),
      testimonials,
      clients,
      faq,
      team,
      stats: [
        { value: '140', label: 'проектов снято' },
        { value: '2 100', label: 'часов исходников' },
        { value: '7', label: 'лет студии' },
        { value: '12', label: 'дней средний срок' },
      ],
      process: [
        { title: 'Бриф', text: 'Спрашиваем, что должно остаться у зрителя после просмотра. Из ответа собирается всё остальное — формат, хронометраж, бюджет.' },
        { title: 'Препродакшн', text: 'Раскадровка, локации, свет, график смен. К съёмочному дню приходим без открытых вопросов: площадка не место для решений.' },
        { title: 'Съёмка', text: 'Снимаем с запасом на монтаж, но по плану. Каждый дубль знает, зачем он нужен в финальной сборке.' },
        { title: 'Пост', text: 'Монтаж, цвет, звук. Черновик показываем до финала: на этом этапе правки стоят дешевле всего.' },
      ],
      heroShots: [
        { src: '/media/hero/shot-1.jpg', title: 'Ночь премьеры', meta: '16:9 · 04:12 · EVENT', alt: 'Сцена в контровом свете во время премьерного показа' },
        { src: '/media/hero/shot-2.jpg', title: 'Утро в мастерской', meta: '9:16 · 00:38 · REELS', alt: 'Свет из окна на верстаке мастерской' },
        { src: '/media/hero/shot-3.jpg', title: 'Смена на Рубинштейна', meta: '9:16 · 00:38 · REELS', alt: 'Ночная улица с фонарями' },
        { src: '/media/hero/shot-4.jpg', title: 'Дорога в Териберку', meta: '2.39:1 · 31:20 · DOC', alt: 'Низкий горизонт северного побережья' },
        { src: '/media/hero/shot-5.jpg', title: 'Последний свет', meta: '1.66:1 · 08:05 · MEMORY', alt: 'Золотой час над полем' },
      ],
    },
  });

  pages.push({
    url: '/styleguide/',
    template: 'styleguide',
    title: 'Дизайн-система',
    description: 'Служебная страница: типографика, цвет, компоненты.',
    breadcrumbs: [{ title: 'Главная', url: '/' }],
    noindex: true,
    data: { services: sortedServices },
  });

  return pages;
}

const RATIO_VALUE = { '9:16': 9 / 16, '16:9': 16 / 9, '2.39:1': 2.39, '1.66:1': 1.66, '4:3': 4 / 3, '1:1': 1 };

/** Добавляет работам поля, нужные только вёрстке: класс позиции, соотношения, размеры. */
function decorateWorks(works, services) {
  const titleOf = (slug) => services.find((s) => s.slug === slug)?.title ?? slug;
  return works.map((w, i) => {
    // Размеры совпадают с тем, что генерирует make-placeholders.js.
    // Без них браузер не знает пропорции и допускает скачок вёрстки.
    const width = 1600;
    const height = Math.round(width / (RATIO_VALUE[w.ratio] ?? 16 / 9));
    return {
      ...w,
      position: `pos-${i + 1}`,
      ratioClass: `ratio-${w.ratio.replace(/[:.]/g, '-')}`,
      serviceTitle: titleOf(w.service),
      posterWebp: w.poster.replace(/\.jpg$/, '.webp'),
      posterWidth: width,
      posterHeight: height,
    };
  });
}

function decorateJournal(items) {
  return items.map((a) => ({ ...a, coverWebp: a.cover.replace(/\.jpg$/, '.webp') }));
}

/* ---------- Рендер ---------- */

function renderPage(page, ctx, partials, assets) {
  const { site } = ctx;
  const layout = readFileSync(join(SRC, 'templates/_layout.html'), 'utf8');
  const body = render(loadTemplate(page.template), { site, page, ...page.data }, partials, page.template);

  return render(layout, {
    site,
    page,
    assets,
    head: head(page, site),
    jsonLd: jsonLd(page, site),
    content: body,
  }, partials, '_layout');
}

function writePage(page, html) {
  const out = page.url === '/'
    ? join(DIST, 'index.html')
    : join(DIST, page.url.replace(/^\/|\/$/g, ''), 'index.html');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  return out;
}

/* ---------- Точка входа ---------- */

async function main() {
  const t0 = Date.now();

  const result = validate();
  if (!report(result)) process.exit(1);
  const content = result.data;

  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });

  const assets = await buildAssets();
  const partials = loadPartials();
  const pages = collectPages(content);

  for (const page of pages) {
    writePage(page, renderPage(page, content, partials, assets));
  }

  writeFileSync(join(DIST, 'sitemap.xml'), sitemap(pages, content.site));
  writeFileSync(join(DIST, 'robots.txt'), robots(content.site));

  if (existsSync(PUBLIC)) cpSync(PUBLIC, DIST, { recursive: true });

  const size = dirSize(DIST);
  console.log(`✓ Собрано за ${Date.now() - t0} мс: ${pages.length} стр., ${(size / 1024 / 1024).toFixed(1)} МБ → dist/`);
}

function dirSize(dir) {
  let total = 0;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    const st = statSync(p);
    total += st.isDirectory() ? dirSize(p) : st.size;
  }
  return total;
}

main().catch((e) => {
  console.error(`\n✗ Сборка не прошла: ${e.message}\n`);
  process.exit(1);
});
