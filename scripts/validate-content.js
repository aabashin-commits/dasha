/**
 * Проверка content/*.json перед сборкой.
 *
 * Смысл файла — техническая гарантия требования ТЗ «добавлять проекты без
 * изменения структуры». Заказчик правит JSON руками, и единственное, что
 * стоит между опечаткой и продом, — этот скрипт. Поэтому каждое сообщение
 * обязано называть файл, индекс объекта и поле.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'content');
const PUBLIC = join(ROOT, 'public');

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_TITLE = 60;
const MAX_DESC = 160;

const errors = [];
const warnings = [];

const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

export function readJson(name) {
  const file = join(CONTENT, `${name}.json`);
  if (!existsSync(file)) throw new Error(`нет файла content/${name}.json`);
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`content/${name}.json — сломанный JSON: ${e.message}`);
  }
}

/* ---------- Помощники ---------- */

function requireFields(obj, fields, where) {
  for (const f of fields) {
    const v = obj[f];
    const empty = v === undefined || v === null || v === ''
      || (Array.isArray(v) && v.length === 0);
    if (empty) err(where, `нет обязательного поля «${f}»`);
  }
}

function checkSlug(slug, where, seen) {
  if (!slug) return;
  if (!SLUG_RE.test(slug)) {
    err(where, `слаг «${slug}» должен быть латиницей в kebab-case`);
  }
  if (seen.has(slug)) err(where, `слаг «${slug}» уже занят`);
  seen.add(slug);
}

function checkMedia(path, where, field) {
  if (!path) return;
  if (!path.startsWith('/')) {
    err(where, `${field}: путь «${path}» должен начинаться со слэша`);
    return;
  }
  if (!existsSync(join(PUBLIC, path))) {
    err(where, `${field}: файла нет на диске — public${path}. Запусти npm run images`);
  }
}

function checkSeo(seo, where) {
  if (!seo) { err(where, 'нет блока «seo»'); return; }
  if (!seo.title) err(where, 'seo.title обязателен');
  else if (seo.title.length > MAX_TITLE) {
    err(where, `seo.title длиннее ${MAX_TITLE} символов (сейчас ${seo.title.length})`);
  }
  if (!seo.description) err(where, 'seo.description обязателен');
  else if (seo.description.length > MAX_DESC) {
    err(where, `seo.description длиннее ${MAX_DESC} символов (сейчас ${seo.description.length})`);
  }
}

function checkGallery(gallery, where) {
  if (!Array.isArray(gallery)) return;
  gallery.forEach((img, i) => {
    const at = `${where} → gallery[${i}]`;
    if (!img.src) err(at, 'нет «src»');
    else checkMedia(img.src, at, 'src');
    // alt обязателен: без него изображение невидимо для скринридера и поиска
    if (!img.alt) err(at, 'нет «alt» — описание обязательно для каждого изображения');
  });
}

/* ---------- Проверки коллекций ---------- */

function validateSite(site) {
  const where = 'site.json';
  requireFields(site, ['name', 'url', 'contacts', 'menu', 'seo'], where);
  if (site.url && !/^https?:\/\//.test(site.url)) {
    err(where, 'url должен быть абсолютным, с протоколом');
  }
  if (site.url?.includes('example')) {
    warn(where, 'url — плейсхолдер. canonical, sitemap и og:url будут нерабочими до подстановки домена');
  }
  if (site.analytics?.enabled && /^0+$/.test(site.analytics.yandexMetrikaId ?? '')) {
    err(where, 'analytics.enabled=true, но yandexMetrikaId — плейсхолдер');
  }
  requireFields(site.contacts ?? {}, ['email', 'telegram'], `${where} → contacts`);
}

function validateServices(services) {
  const seen = new Set();
  services.forEach((s, i) => {
    const where = `services.json[${i}]${s.slug ? ` «${s.slug}»` : ''}`;
    requireFields(s, ['slug', 'title', 'tagline', 'summary', 'description', 'format', 'features', 'order'], where);
    checkSlug(s.slug, where, seen);
    requireFields(s.format ?? {}, ['ratio', 'duration'], `${where} → format`);
    checkSeo(s.seo, where);
    checkMedia(s.heroPoster, where, 'heroPoster');
    if (s.priceFrom !== undefined && typeof s.priceFrom !== 'number') {
      err(where, 'priceFrom должен быть числом без пробелов и знака рубля');
    }
  });
  return new Set(services.map((s) => s.slug));
}

function validateWorks(works, serviceSlugs) {
  const seen = new Set();
  const RATIOS = ['9:16', '16:9', '2.39:1', '1.66:1', '4:3', '1:1'];
  const PROVIDERS = ['vk', 'rutube', 'youtube', 'file'];

  works.forEach((w, i) => {
    const where = `works.json[${i}]${w.slug ? ` «${w.slug}»` : ''}`;
    requireFields(w, ['slug', 'title', 'service', 'year', 'ratio', 'summary', 'description', 'poster', 'order'], where);
    checkSlug(w.slug, where, seen);
    checkSeo(w.seo, where);
    checkMedia(w.poster, where, 'poster');
    checkGallery(w.gallery, where);

    if (w.service && !serviceSlugs.has(w.service)) {
      err(where, `service «${w.service}» не найден среди слагов в services.json`);
    }
    if (w.ratio && !RATIOS.includes(w.ratio)) {
      err(where, `ratio «${w.ratio}» не из списка: ${RATIOS.join(', ')}`);
    }
    if (w.video) {
      if (!PROVIDERS.includes(w.video.provider)) {
        err(where, `video.provider «${w.video.provider}» не из списка: ${PROVIDERS.join(', ')}`);
      }
      if (!w.video.id) err(where, 'video.id обязателен, если блок video есть');
    }
  });
  return new Set(works.map((w) => w.slug));
}

function validateJournal(journal) {
  const seen = new Set();
  journal.forEach((a, i) => {
    const where = `journal.json[${i}]${a.slug ? ` «${a.slug}»` : ''}`;
    requireFields(a, ['slug', 'title', 'excerpt', 'date', 'body', 'cover'], where);
    checkSlug(a.slug, where, seen);
    checkMedia(a.cover, where, 'cover');
    if (a.cover && !a.coverAlt) err(where, 'нет «coverAlt» — описание обложки обязательно');
    if (a.date && Number.isNaN(new Date(a.date).getTime())) {
      err(where, `date «${a.date}» не разбирается, нужен формат ГГГГ-ММ-ДД`);
    }
  });
}

function validateTeam(team) {
  team.forEach((p, i) => {
    const where = `team.json[${i}]${p.name ? ` «${p.name}»` : ''}`;
    requireFields(p, ['name', 'role', 'photo'], where);
    checkMedia(p.photo, where, 'photo');
  });
}

function validateTestimonials(items, workSlugs) {
  items.forEach((t, i) => {
    const where = `testimonials.json[${i}]`;
    requireFields(t, ['author', 'text'], where);
    if (t.workSlug && !workSlugs.has(t.workSlug)) {
      err(where, `workSlug «${t.workSlug}» не найден среди слагов в works.json`);
    }
  });
}

function validateClients(items) {
  items.forEach((c, i) => {
    const where = `clients.json[${i}]${c.name ? ` «${c.name}»` : ''}`;
    requireFields(c, ['name', 'logo'], where);
    checkMedia(c.logo, where, 'logo');
  });
}

function validateFaq(items) {
  items.forEach((f, i) => {
    requireFields(f, ['q', 'a'], `faq.json[${i}]`);
  });
}

/* ---------- Точка входа ---------- */

export function validate() {
  errors.length = 0;
  warnings.length = 0;

  const site = readJson('site');
  const services = readJson('services');
  const works = readJson('works');
  const journal = readJson('journal');
  const team = readJson('team');
  const testimonials = readJson('testimonials');
  const clients = readJson('clients');
  const faq = readJson('faq');

  validateSite(site);
  const serviceSlugs = validateServices(services);
  const workSlugs = validateWorks(works, serviceSlugs);
  validateJournal(journal);
  validateTeam(team);
  validateTestimonials(testimonials, workSlugs);
  validateClients(clients);
  validateFaq(faq);

  return {
    ok: errors.length === 0,
    errors: [...errors],
    warnings: [...warnings],
    data: { site, services, works, journal, team, testimonials, clients, faq },
  };
}

export function report(result) {
  for (const w of result.warnings) console.warn(`  ⚠  ${w}`);
  if (result.ok) {
    console.log(`✓ Контент валиден${result.warnings.length ? ` (предупреждений: ${result.warnings.length})` : ''}`);
    return true;
  }
  console.error(`\n✗ Ошибок в контенте: ${result.errors.length}\n`);
  for (const e of result.errors) console.error(`  • ${e}`);
  console.error('');
  return false;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    if (!report(validate())) process.exit(1);
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }
}
