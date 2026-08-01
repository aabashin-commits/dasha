/**
 * Лайтбокс галереи кейса: клавиатура, свайп, ловушка фокуса.
 *
 * Разметка создаётся здесь, а не в шаблоне: без JS галерея остаётся
 * обычной сеткой картинок, и пустой оверлей в HTML был бы мусором.
 */

const CALM = matchMedia('(prefers-reduced-motion: reduce)');
const SWIPE_MIN = 40;

export function init() {
  const items = [...document.querySelectorAll('[data-lightbox]')];
  if (items.length === 0) return;

  const shots = items.map((el) => ({
    src: el.dataset.lightbox,
    alt: el.dataset.lightboxAlt || '',
  }));

  const box = document.createElement('div');
  box.className = 'lightbox';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', 'Просмотр изображения');
  box.innerHTML = `
    <img class="lightbox__img" alt="">
    <p class="lightbox__caption"></p>
    <button class="lightbox__btn lightbox__btn--close" type="button" aria-label="Закрыть">✕</button>
    <button class="lightbox__btn lightbox__btn--prev" type="button" aria-label="Предыдущее">←</button>
    <button class="lightbox__btn lightbox__btn--next" type="button" aria-label="Следующее">→</button>`;
  document.body.append(box);

  const img = box.querySelector('.lightbox__img');
  const caption = box.querySelector('.lightbox__caption');
  const btnClose = box.querySelector('.lightbox__btn--close');
  const btnPrev = box.querySelector('.lightbox__btn--prev');
  const btnNext = box.querySelector('.lightbox__btn--next');

  const single = shots.length < 2;
  btnPrev.hidden = single;
  btnNext.hidden = single;

  let index = 0;
  let lastFocused = null;

  const show = (i) => {
    index = (i + shots.length) % shots.length;
    img.src = shots[index].src;
    img.alt = shots[index].alt;
    caption.textContent = single
      ? shots[index].alt
      : `${index + 1} / ${shots.length} · ${shots[index].alt}`;
  };

  const open = (i) => {
    lastFocused = document.activeElement;
    show(i);
    box.classList.add('lightbox--open');
    document.body.classList.add('is-locked');
    btnClose.focus();
  };

  const close = () => {
    box.classList.remove('lightbox--open');
    document.body.classList.remove('is-locked');
    // Освобождаем память: полноразмерный кадр больше не нужен
    img.removeAttribute('src');
    lastFocused?.focus?.();
  };

  items.forEach((el, i) => {
    el.addEventListener('click', (e) => { e.preventDefault(); open(i); });
  });

  btnClose.addEventListener('click', close);
  btnPrev.addEventListener('click', () => show(index - 1));
  btnNext.addEventListener('click', () => show(index + 1));

  // Клик по подложке закрывает, клик по самому кадру — нет
  box.addEventListener('click', (e) => { if (e.target === box) close(); });

  addEventListener('keydown', (e) => {
    if (!box.classList.contains('lightbox--open')) return;

    if (e.key === 'Escape') { close(); return; }
    if (!single && e.key === 'ArrowLeft') { show(index - 1); return; }
    if (!single && e.key === 'ArrowRight') { show(index + 1); return; }
    if (e.key !== 'Tab') return;

    const focusable = [...box.querySelectorAll('button:not([hidden])')];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  if (single || CALM.matches) return;

  let startX = 0;
  box.addEventListener('touchstart', (e) => { startX = e.changedTouches[0].clientX; }, { passive: true });
  box.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > SWIPE_MIN) show(index + (dx < 0 ? 1 : -1));
  }, { passive: true });
}
