/**
 * Подмножество Markdown для тела статей журнала.
 *
 * Полноценный парсер здесь избыточен: статьи пишет студия, а не внешние
 * авторы, и набор конструкций закрыт намеренно. Всё, что не описано ниже,
 * останется текстом — это лучше, чем тихо пропустить непонятую разметку.
 *
 * Поддержано: ## и ### заголовки, абзацы, списки на «- », **жирный»,
 * [ссылки](/url), > цитаты.
 */

import { escape } from './template.js';

/** Инлайновая разметка внутри уже экранированного текста. */
function inline(text) {
  return escape(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    // Тире между словами превращаем в тире с неразрывным пробелом слева,
    // иначе оно уезжает в начало строки
    .replace(/ — /g, '&nbsp;— ');
}

export function markdown(src) {
  const blocks = String(src).split(/\n{2,}/);
  const out = [];

  for (const raw of blocks) {
    const block = raw.trim();
    if (!block) continue;

    if (block.startsWith('### ')) {
      out.push(`<h3>${inline(block.slice(4))}</h3>`);
      continue;
    }
    if (block.startsWith('## ')) {
      out.push(`<h2>${inline(block.slice(3))}</h2>`);
      continue;
    }
    if (block.startsWith('> ')) {
      const text = block.split('\n').map((l) => l.replace(/^>\s?/, '')).join(' ');
      out.push(`<blockquote>${inline(text)}</blockquote>`);
      continue;
    }
    if (/^-\s/.test(block)) {
      const items = block.split('\n')
        .filter((l) => /^-\s/.test(l.trim()))
        .map((l) => `<li>${inline(l.trim().slice(2))}</li>`);
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }
    out.push(`<p>${inline(block.replace(/\n/g, ' '))}</p>`);
  }

  return out.join('\n');
}

/** Оценка времени чтения: 180 слов в минуту для русского текста. */
export function readingTime(src) {
  const words = String(src).trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 180));
}
