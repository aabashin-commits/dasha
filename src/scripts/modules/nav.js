/**
 * Мобильное меню: бургер, полноэкранный оверлей, ловушка фокуса.
 *
 * Шапка лежит выше меню по z-index, поэтому бургер остаётся кликабельным
 * и превращается в крестик. Без этого меню закрывалось бы только Escape.
 */

const DESKTOP = 900;

export function init() {
  const burger = document.querySelector('[data-burger]');
  const menu = document.querySelector('[data-menu]');
  if (!burger || !menu) return;

  let lastFocused = null;

  const isOpen = () => menu.classList.contains('menu--open');

  const setOpen = (open) => {
    document.body.classList.toggle('is-menu-open', open);
    document.body.classList.toggle('is-locked', open);
    menu.classList.toggle('menu--open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');

    if (open) {
      lastFocused = document.activeElement;
      menu.querySelector('a[href]')?.focus();
    } else {
      lastFocused?.focus?.();
    }
  };

  burger.addEventListener('click', () => setOpen(!isOpen()));

  // Переход по ссылке закрывает меню: якоря внутри одной страницы
  // иначе прокрутили бы фон под открытым оверлеем
  menu.addEventListener('click', (e) => {
    if (e.target.closest('a[href]')) setOpen(false);
  });

  addEventListener('keydown', (e) => {
    if (!isOpen()) return;

    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key !== 'Tab') return;

    const focusable = menu.querySelectorAll('a[href], button:not([disabled])');
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  // Разворот экрана не должен оставлять залипший оверлей и заблокированный скролл
  addEventListener('resize', () => {
    if (innerWidth >= DESKTOP && isOpen()) setOpen(false);
  });
}
