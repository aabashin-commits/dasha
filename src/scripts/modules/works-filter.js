/**
 * Фильтр портфолио по направлению.
 *
 * Карточки скрываются, а не удаляются и не подгружаются: все работы
 * присутствуют в HTML, иначе фильтрация съедает индексацию.
 *
 * Состояние живёт в ?service= через replaceState — ссылку на отфильтрованное
 * портфолио можно отправить, но история браузера не засоряется.
 */

import { track } from './analytics.js';

const ALL = 'all';

export function init() {
  const root = document.querySelector('[data-works-filter]');
  if (!root) return;

  const buttons = [...root.querySelectorAll('[data-filter]')];
  const grid = document.querySelector('.works');
  const cards = [...document.querySelectorAll('[data-work-service]')];
  const empty = document.querySelector('[data-filter-empty]');
  if (buttons.length === 0 || cards.length === 0) return;

  const apply = (value, { push = true } = {}) => {
    let shown = 0;

    for (const card of cards) {
      const match = value === ALL || card.dataset.workService === value;
      card.hidden = !match;
      if (match) shown++;
    }

    // Явная раскладка рассчитана на полный набор карточек. Когда часть
    // скрыта, закреплённые колонки и строки оставляют дыры — переключаем
    // сетку на равные колонки.
    grid?.classList.toggle('works--filtered', value !== ALL);

    for (const btn of buttons) {
      btn.setAttribute('aria-pressed', String(btn.dataset.filter === value));
    }

    if (empty) empty.hidden = shown > 0;

    if (push) {
      const url = new URL(location.href);
      if (value === ALL) url.searchParams.delete('service');
      else url.searchParams.set('service', value);
      history.replaceState(null, '', url);
      track('filter_works', { service: value });
    }
  };

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filter]');
    if (btn) apply(btn.dataset.filter);
  });

  // Ссылка на отфильтрованное портфолио должна открываться уже отфильтрованной
  const initial = new URL(location.href).searchParams.get('service');
  const known = buttons.some((b) => b.dataset.filter === initial);
  apply(known ? initial : ALL, { push: false });
}
