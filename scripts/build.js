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
import { markdown, readingTime } from './lib/markdown.js';
import { validate, report } from './validate-content.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');
const PUBLIC = join(ROOT, 'public');

const PROD = process.env.NODE_ENV !== 'development';

/* Тексты, общие для нескольких страниц. В content/*.json они не вынесены
   намеренно: это не контент, которым управляет заказчик, а часть
   повествования сайта. Если появится нужда их редактировать — переедут. */

const STATS = [
  { value: '140', label: 'проектов снято' },
  { value: '2 100', label: 'часов исходников' },
  { value: '7', label: 'лет студии' },
  { value: '12', label: 'дней средний срок' },
];

/* Кадры героя. Это не контент заказчика, а часть повествования страницы,
   поэтому живут здесь, а не в content/*.json. */
const HERO_SHOTS = [
  { src: '/media/hero/shot-1.jpg', title: 'Ночь премьеры', meta: '16:9 · 04:12 · EVENT', alt: 'Сцена в контровом свете во время премьерного показа' },
  { src: '/media/hero/shot-2.jpg', title: 'Утро в мастерской', meta: '9:16 · 00:38 · REELS', alt: 'Свет из окна на верстаке мастерской' },
  { src: '/media/hero/shot-3.jpg', title: 'Смена на Рубинштейна', meta: '9:16 · 00:38 · REELS', alt: 'Ночная улица с фонарями' },
  { src: '/media/hero/shot-4.jpg', title: 'Дорога в Териберку', meta: '2.39:1 · 31:20 · DOC', alt: 'Низкий горизонт северного побережья' },
  { src: '/media/hero/shot-5.jpg', title: 'Последний свет', meta: '1.66:1 · 08:05 · MEMORY', alt: 'Золотой час над полем' },
];

const PROCESS = [
  { title: 'Бриф', text: 'Спрашиваем, что должно остаться у зрителя после просмотра. Из ответа собирается всё остальное — формат, хронометраж, бюджет.' },
  { title: 'Препродакшн', text: 'Раскадровка, локации, свет, график смен. К съёмочному дню приходим без открытых вопросов: площадка не место для решений.' },
  { title: 'Съёмка', text: 'Снимаем с запасом на монтаж, но по плану. Каждый дубль знает, зачем он нужен в финальной сборке.' },
  { title: 'Пост', text: 'Монтаж, цвет, звук. Черновик показываем до финала: на этом этапе правки стоят дешевле всего.' },
];

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
      stats: STATS,
      process: PROCESS,
      heroShots: HERO_SHOTS.map((s) => ({
        ...s,
        srcset: srcset(s.src, HERO_WIDTHS, 1920),
        srcsetWebp: srcset(s.src, HERO_WIDTHS, 1920, 'webp'),
        srcsetAvif: srcset(s.src, HERO_WIDTHS, 1920, 'avif'),
      })),
    },
  });

  /* ---- Услуги ---- */

  const HOME = { title: 'Главная', url: '/' };

  pages.push({
    url: '/services/',
    template: 'services-list',
    title: 'Направления съёмки',
    description: 'Reels, съёмка событий, документальное кино и фильмы-воспоминания. Форматы, сроки и стоимость каждого направления.',
    breadcrumbs: [HOME, { title: 'Направления', url: '/services/' }],
    priority: '0.9',
    data: { works: decorateWorks(works, sortedServices) },
  });

  for (const s of sortedServices) {
    const related = works.filter((w) => w.service === s.slug).sort(byOrder).slice(0, 3);
    pages.push({
      url: `/services/${s.slug}/`,
      template: 'service-detail',
      title: s.seo.title,
      description: s.seo.description,
      ogImage: `/media/og/${s.slug}.jpg`,
      breadcrumbs: [HOME, { title: 'Направления', url: '/services/' }, { title: s.title, url: `/services/${s.slug}/` }],
      service: s,
      faq: s.faq,
      priority: '0.9',
      data: { service: s, works: decorateWorks(related, sortedServices) },
    });
  }

  /* ---- Работы ---- */

  const allWorks = decorateWorks([...works].sort(byOrder), sortedServices);

  pages.push({
    url: '/works/',
    template: 'works-list',
    title: 'Работы студии',
    description: 'Портфолио Keyframe: документальные фильмы, съёмки событий, вертикальные ролики и фильмы-воспоминания.',
    breadcrumbs: [HOME, { title: 'Работы', url: '/works/' }],
    priority: '0.9',
    data: { works: allWorks, filters: sortedServices },
  });

  allWorks.forEach((w, i) => {
    const next = allWorks[(i + 1) % allWorks.length];
    pages.push({
      url: `/works/${w.slug}/`,
      template: 'work-detail',
      title: w.seo.title,
      description: w.seo.description,
      ogImage: `/media/og/${w.slug}.jpg`,
      ogType: 'article',
      breadcrumbs: [HOME, { title: 'Работы', url: '/works/' }, { title: w.title, url: `/works/${w.slug}/` }],
      work: w,
      data: {
        work: { ...w, gallery: decorateGallery(w.gallery) },
        next,
        embedUrl: embedUrl(w.video),
      },
    });
  });

  /* ---- Журнал ---- */

  pages.push({
    url: '/journal/',
    template: 'journal-list',
    title: 'Журнал',
    description: 'Как устроен видеопродакшн изнутри: из чего складывается цена, зачем нужен сценарий и чем вертикаль отличается от горизонтали.',
    breadcrumbs: [HOME, { title: 'Журнал', url: '/journal/' }],
    data: { journal: decorateJournal(latest) },
  });

  for (const a of latest) {
    pages.push({
      url: `/journal/${a.slug}/`,
      template: 'journal-detail',
      title: a.title,
      description: a.excerpt,
      ogImage: `/media/og/${a.slug}.jpg`,
      ogType: 'article',
      publishedAt: a.date,
      breadcrumbs: [HOME, { title: 'Журнал', url: '/journal/' }, { title: a.title, url: `/journal/${a.slug}/` }],
      article: a,
      lastmod: a.date,
      data: {
        article: decorateJournal([a])[0],
        bodyHtml: markdown(a.body),
        minutes: readingTime(a.body),
        more: decorateJournal(latest.filter((x) => x.slug !== a.slug).slice(0, 2)),
      },
    });
  }

  /* ---- Остальное ---- */

  pages.push({
    url: '/about/',
    template: 'about',
    title: 'О студии',
    description: 'Keyframe — студия видеопродакшна в Москве. Как мы работаем, кто в команде и почему начинаем не с камеры.',
    breadcrumbs: [HOME, { title: 'О студии', url: '/about/' }],
    data: { team: decorateTeam(team), stats: STATS, process: PROCESS, clients },
  });

  pages.push({
    url: '/contacts/',
    template: 'contacts',
    title: 'Контакты',
    description: `Связаться со студией Keyframe: ${site.contacts.email}, Telegram @${site.contacts.telegram}. ${site.city}.`,
    breadcrumbs: [HOME, { title: 'Контакты', url: '/contacts/' }],
    localBusiness: true,
    priority: '0.8',
    data: {},
  });

  pages.push({
    url: '/privacy/',
    template: 'privacy',
    title: 'Политика обработки персональных данных',
    description: 'Как студия Keyframe обрабатывает и хранит персональные данные, отправленные через форму на сайте.',
    breadcrumbs: [HOME, { title: 'Политика конфиденциальности', url: '/privacy/' }],
    priority: '0.3',
    data: {},
  });

  pages.push({
    url: '/404.html',
    template: '404',
    title: 'Страница не найдена',
    description: 'Такой страницы на сайте нет.',
    breadcrumbs: [HOME],
    noindex: true,
    data: { works: decorateWorks(featured.slice(0, 3), sortedServices) },
  });

  pages.push({
    url: '/styleguide/',
    template: 'styleguide',
    title: 'Дизайн-система',
    description: 'Служебная страница: типографика, цвет, компоненты.',
    breadcrumbs: [HOME],
    noindex: true,
    data: {},
  });

  return pages;
}

/** URL плеера по провайдеру. Подставляется только по клику на постер. */
function embedUrl(video) {
  if (!video) return '';
  const { provider, id } = video;
  if (provider === 'vk') return `https://vk.com/video_ext.php?oid=${id.split('_')[0].replace('video-', '-')}&id=${id.split('_')[1]}&hd=2`;
  if (provider === 'rutube') return `https://rutube.ru/play/embed/${id}/`;
  if (provider === 'youtube') return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1`;
  return id;
}

function decorateGallery(gallery) {
  return (gallery ?? []).map((g) => ({
    ...g,
    srcWebp: g.src.replace(/\.jpg$/, '.webp'),
    srcAvif: g.src.replace(/\.jpg$/, '.avif'),
  }));
}

function decorateTeam(team) {
  return team.map((p) => ({
    ...p,
    photoWebp: p.photo.replace(/\.jpg$/, '.webp'),
    photoAvif: p.photo.replace(/\.jpg$/, '.avif'),
  }));
}

const RATIO_VALUE = { '9:16': 9 / 16, '16:9': 16 / 9, '2.39:1': 2.39, '1.66:1': 1.66, '4:3': 4 / 3, '1:1': 1 };

/**
 * Строка srcset из вариантов, которые сгенерировал make-placeholders.js.
 * Без неё телефону уезжает кадр в 1600–1920 пикселей — это секунды LCP
 * на медленной сети.
 */
function srcset(path, widths, full, ext) {
  const file = ext ? path.replace(/\.jpg$/, `.${ext}`) : path;
  const parts = widths.map((w) => {
    const variant = file.replace(/\.(jpg|webp)$/, `-${w}.$1`);
    return `${variant} ${w}w`;
  });
  parts.push(`${file} ${full}w`);
  return parts.join(', ');
}

const POSTER_WIDTHS = [480, 800, 1200];
const HERO_WIDTHS = [640, 1024, 1440];

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
      // Раскладка задана на шесть позиций и дальше повторяется циклом,
      // иначе седьмая работа осталась бы без правила размещения
      position: `pos-${(i % 6) + 1}`,
      ratioClass: `ratio-${w.ratio.replace(/[:.]/g, '-')}`,
      serviceTitle: titleOf(w.service),
      posterWebp: w.poster.replace(/\.jpg$/, '.webp'),
      posterAvif: w.poster.replace(/\.jpg$/, '.avif'),
      posterWidth: width,
      posterHeight: height,
      posterSrcset: srcset(w.poster, POSTER_WIDTHS, width),
      posterSrcsetWebp: srcset(w.poster, POSTER_WIDTHS, width, 'webp'),
      posterSrcsetAvif: srcset(w.poster, POSTER_WIDTHS, width, 'avif'),
    };
  });
}

function decorateJournal(items) {
  return items.map((a) => ({
    ...a,
    coverWebp: a.cover.replace(/\.jpg$/, '.webp'),
    coverAvif: a.cover.replace(/\.jpg$/, '.avif'),
  }));
}

/* ---------- Рендер ---------- */

function renderPage(page, ctx, partials, assets) {
  const { site } = ctx;
  const layout = readFileSync(join(SRC, 'templates/_layout.html'), 'utf8');

  // Глобальный контекст доступен любому шаблону: форма заявки нужна почти
  // везде и всегда хочет список услуг. Данные страницы перекрывают глобальные.
  const scope = {
    site,
    page,
    services: ctx.servicesSorted,
    ...page.data,
  };

  const body = render(loadTemplate(page.template), scope, partials, page.template);

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
  // Страницы с расширением пишутся файлом, остальные — каталогом с index.html
  const out = page.url.endsWith('.html')
    ? join(DIST, page.url.replace(/^\//, ''))
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

  // Список услуг нужен форме заявки на каждой странице
  content.servicesSorted = [...content.services].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

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
