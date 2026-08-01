/**
 * Мини-шаблонизатор без зависимостей.
 *
 * {{ path }}                    подстановка с HTML-экранированием
 * {{{ path }}}                  подстановка без экранирования
 * {{ path | filter:arg }}       фильтры: money, date, truncate, plural, ratio
 * {{#if path}}…{{else}}…{{/if}}
 * {{#each path}}…{{/each}}      внутри: this, @index, @first, @last, @number
 * {{> partial-name }}
 *
 * Ключевое отличие от привычных движков: неизвестная переменная в подстановке
 * бросает исключение, а не подставляет пустую строку. Опечатка в JSON или
 * шаблоне валит сборку сразу, а не уезжает молча на прод.
 * {{#if}} к отсутствию поля терпим — иначе нельзя описать необязательные поля.
 */

const TAG = /\{\{\{\s*(.*?)\s*\}\}\}|\{\{\s*(.*?)\s*\}\}/gs;

class TemplateError extends Error {}

/* ---------- Фильтры ---------- */

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

const FILTERS = {
  // 45000 → «45 000» (неразрывные пробелы, чтобы цена не переносилась)
  money: (v) => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' '),

  // «2026-03-12» → «12 марта 2026»
  date: (v) => {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) throw new TemplateError(`фильтр date: не дата — ${v}`);
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  },

  truncate: (v, n) => {
    const s = String(v);
    const max = Number(n) || 120;
    return s.length <= max ? s : s.slice(0, s.lastIndexOf(' ', max)) + '…';
  },

  // {{ count | plural:кейс,кейса,кейсов }}
  plural: (v, forms) => {
    const [one, few, many] = String(forms).split(',');
    const n = Math.abs(Number(v)) % 100;
    const d = n % 10;
    if (n > 10 && n < 20) return many;
    if (d > 1 && d < 5) return few;
    if (d === 1) return one;
    return many;
  },

  // «9:16» → «9-16», чтобы класть в имя CSS-класса
  ratio: (v) => String(v).replace(/[:.]/g, '-'),
};

/* ---------- Экранирование ---------- */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

/* ---------- Разрешение путей ---------- */

/**
 * Ищет путь по цепочке областей видимости, от внутренней к внешней.
 * Так внутри {{#each}} остаются доступны поля страницы и site.
 */
function lookup(scopes, path) {
  if (path === 'this') return { found: true, value: scopes[scopes.length - 1] };

  const parts = path.split('.');
  for (let i = scopes.length - 1; i >= 0; i--) {
    let cur = scopes[i];
    if (cur === null || typeof cur !== 'object') continue;
    if (!(parts[0] in cur)) continue;

    let ok = true;
    for (const p of parts) {
      if (cur !== null && typeof cur === 'object' && p in cur) cur = cur[p];
      else { ok = false; break; }
    }
    if (ok) return { found: true, value: cur };
  }
  return { found: false, value: undefined };
}

function applyFilters(value, chain) {
  return chain.reduce((acc, part) => {
    const [name, ...rest] = part.split(':');
    const fn = FILTERS[name.trim()];
    if (!fn) throw new TemplateError(`неизвестный фильтр «${name.trim()}»`);
    return fn(acc, rest.join(':'));
  }, value);
}

/* ---------- Парсер ---------- */

function parse(src, file) {
  const nodes = [];
  const stack = [{ children: nodes }];
  let last = 0;
  let m;

  const push = (node) => stack[stack.length - 1].children.push(node);
  const text = (s) => { if (s) push({ t: 'text', v: s }); };

  TAG.lastIndex = 0;
  while ((m = TAG.exec(src)) !== null) {
    text(src.slice(last, m.index));
    last = m.index + m[0].length;

    const raw = m[1] !== undefined;
    const body = (raw ? m[1] : m[2]).trim();

    if (body.startsWith('#if ')) {
      const node = { t: 'if', path: body.slice(4).trim(), children: [], alt: null };
      push(node);
      stack.push({ children: node.children, node });
    } else if (body.startsWith('#each ')) {
      const node = { t: 'each', path: body.slice(6).trim(), children: [] };
      push(node);
      stack.push({ children: node.children, node });
    } else if (body === 'else') {
      const top = stack[stack.length - 1];
      if (!top.node || top.node.t !== 'if') {
        throw new TemplateError(`${file}: {{else}} вне {{#if}}`);
      }
      top.node.alt = [];
      top.children = top.node.alt;
    } else if (body.startsWith('/')) {
      if (stack.length === 1) throw new TemplateError(`${file}: лишний {{${body}}}`);
      stack.pop();
    } else if (body.startsWith('>')) {
      push({ t: 'partial', name: body.slice(1).trim() });
    } else {
      const [pathPart, ...filters] = body.split('|');
      push({ t: 'var', path: pathPart.trim(), filters: filters.map((f) => f.trim()), raw });
    }
  }
  text(src.slice(last));

  if (stack.length > 1) throw new TemplateError(`${file}: незакрытый блок`);
  return nodes;
}

/* ---------- Рендер ---------- */

function renderNodes(nodes, scopes, partials, file) {
  let out = '';

  for (const n of nodes) {
    if (n.t === 'text') { out += n.v; continue; }

    if (n.t === 'partial') {
      const src = partials[n.name];
      if (src === undefined) {
        throw new TemplateError(`${file}: нет partial «${n.name}»`);
      }
      out += renderNodes(parse(src, n.name), scopes, partials, n.name);
      continue;
    }

    if (n.t === 'if') {
      const { value } = lookup(scopes, n.path);
      const truthy = Array.isArray(value) ? value.length > 0 : Boolean(value);
      if (truthy) out += renderNodes(n.children, scopes, partials, file);
      else if (n.alt) out += renderNodes(n.alt, scopes, partials, file);
      continue;
    }

    if (n.t === 'each') {
      const { found, value } = lookup(scopes, n.path);
      if (!found) throw new TemplateError(`${file}: {{#each ${n.path}}} — нет такого поля`);
      if (!Array.isArray(value)) {
        throw new TemplateError(`${file}: {{#each ${n.path}}} — это не массив`);
      }
      value.forEach((item, i) => {
        const locals = {
          '@index': i,
          '@number': String(i + 1).padStart(2, '0'),
          '@first': i === 0,
          '@last': i === value.length - 1,
        };
        const frame = (item !== null && typeof item === 'object')
          ? { ...item, ...locals }
          : locals;
        out += renderNodes(n.children, [...scopes, frame, item], partials, file);
      });
      continue;
    }

    // n.t === 'var'
    const { found, value } = lookup(scopes, n.path);
    if (!found) {
      throw new TemplateError(
        `${file}: нет значения для {{ ${n.path} }}. ` +
        `Проверь поле в content/*.json или опечатку в шаблоне.`
      );
    }
    const v = n.filters.length ? applyFilters(value, n.filters) : value;
    out += n.raw ? String(v) : escape(v);
  }

  return out;
}

/**
 * @param {string} src      исходник шаблона
 * @param {object} data     данные страницы
 * @param {object} partials { имя: исходник }
 * @param {string} file     имя для сообщений об ошибках
 */
export function render(src, data, partials = {}, file = 'template') {
  return renderNodes(parse(src, file), [data], partials, file);
}

export { TemplateError, escape, FILTERS };
