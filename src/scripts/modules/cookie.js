/**
 * Баннер об аналитических cookie.
 *
 * Требование 152-ФЗ при сборе персональных данных. Разметка создаётся
 * здесь, а не в шаблоне: пользователю, который уже ответил, баннер
 * в HTML не нужен вовсе.
 *
 * До ответа счётчики не грузятся — этим занимается analytics.js,
 * читающий тот же ключ.
 */

const KEY = 'kf-cookie-consent';

export const consent = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    // Приватный режим Safari: localStorage бросает исключение.
    // Считаем, что согласия нет, но и баннер каждый раз не показываем
    return 'unavailable';
  }
};

export function init() {
  if (consent() !== null) return;
  if (document.body.dataset.analytics !== 'on') return;

  const bar = document.createElement('div');
  bar.className = 'cookie';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Сообщение о файлах cookie');
  bar.innerHTML = `
    <p class="cookie__text">
      Сайт использует cookie для веб-аналитики: так мы понимаем, какие
      страницы работают. Подробности — в
      <a href="/privacy/">политике обработки данных</a>.
    </p>
    <div class="cookie__actions">
      <button class="btn btn--primary" type="button" data-cookie="granted">Принять</button>
      <button class="btn" type="button" data-cookie="denied">Только необходимое</button>
    </div>`;

  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cookie]');
    if (!btn) return;
    try { localStorage.setItem(KEY, btn.dataset.cookie); } catch { /* приватный режим */ }
    bar.remove();
    if (btn.dataset.cookie === 'granted') {
      dispatchEvent(new CustomEvent('kf:consent-granted'));
    }
  });

  document.body.append(bar);
  requestAnimationFrame(() => bar.classList.add('cookie--in'));
}
