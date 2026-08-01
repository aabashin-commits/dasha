/**
 * Появление секций при скролле.
 *
 * Класс .reveal скрывает элемент только под .js на <html> — его ставит
 * инлайн-скрипт в начале <body>. Если JavaScript не выполнился, страница
 * остаётся полностью читаемой.
 */

const CALM = matchMedia('(prefers-reduced-motion: reduce)');

export function init() {
  const items = [...document.querySelectorAll('.reveal')];
  if (items.length === 0) return;

  const showAll = () => items.forEach((el) => el.classList.add('reveal--in'));

  if (CALM.matches || !('IntersectionObserver' in window)) {
    showAll();
    return;
  }

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('reveal--in');
      io.unobserve(entry.target);
    }
  }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });

  for (const el of items) io.observe(el);
}
