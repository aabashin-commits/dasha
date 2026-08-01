/**
 * Сигнатурный таймлайн-спайн.
 *
 * Маркеры ключевых кадров строятся из секций страницы: каждая секция
 * с data-keyframe становится точкой на таймлайне. Плейхед следует за
 * скроллом, активный маркер загорается, по клику страница переходит
 * к секции. Это навигация, а не индикатор прогресса.
 */

const CALM = matchMedia('(prefers-reduced-motion: reduce)');

export function init() {
  const spine = document.querySelector('[data-spine]');
  const rail = document.querySelector('[data-rail-fill]');
  const sections = [...document.querySelectorAll('[data-keyframe]')];
  if (sections.length === 0) return;

  const list = spine?.querySelector('[data-spine-list]');
  const playhead = spine?.querySelector('[data-playhead]');
  const dots = [];

  if (list) {
    for (const section of sections) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'keyframe';
      btn.setAttribute('aria-label', `Перейти к секции «${section.dataset.keyframe}»`);
      btn.innerHTML =
        '<span class="keyframe__dot"></span>'
        + `<span class="keyframe__label">${section.dataset.keyframe}</span>`;
      btn.addEventListener('click', () => {
        section.scrollIntoView({ behavior: CALM.matches ? 'auto' : 'smooth', block: 'start' });
      });
      list.append(btn);
      dots.push(btn);
    }
  }

  let lineHeight = 0;
  let queued = false;

  const measure = () => {
    lineHeight = spine?.querySelector('[data-spine-line]')?.offsetHeight ?? 0;
  };

  const paint = () => {
    queued = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    const progress = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;

    if (playhead) playhead.style.height = `${lineHeight * progress}px`;
    if (rail) rail.style.width = `${progress * 100}%`;

    if (dots.length === 0) return;
    // Активна секция, чья верхняя граница выше трети экрана
    const line = scrollY + innerHeight * 0.35;
    let active = 0;
    sections.forEach((s, i) => { if (s.offsetTop <= line) active = i; });
    dots.forEach((d, i) => d.classList.toggle('keyframe--active', i === active));
  };

  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(paint);
  };

  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', () => { measure(); paint(); });
  measure();
  paint();
}
