/**
 * Подстановка плеера по клику.
 *
 * До клика на странице только постер: один embed VK или Rutube тянет около
 * мегабайта скриптов и портит LCP на странице, где видео могут не запустить.
 */

import { track } from './analytics.js';

export function init() {
  for (const facade of document.querySelectorAll('[data-facade]')) {
    facade.addEventListener('click', (e) => {
      e.preventDefault();

      const src = facade.dataset.facade;
      if (!src) return;

      const frame = document.createElement('iframe');
      frame.className = 'facade__frame';
      frame.src = src;
      frame.title = facade.dataset.facadeTitle || 'Видео';
      // fullscreen уже разрешён через allow; отдельный allowfullscreen
      // только вызывает предупреждение о конфликте атрибутов
      frame.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
      frame.loading = 'lazy';

      facade.append(frame);
      facade.querySelector('.facade__play')?.remove();
      facade.removeAttribute('data-facade');

      track('play_case_video', { title: frame.title });
    }, { once: true });
  }
}
