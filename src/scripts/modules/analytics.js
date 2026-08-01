/**
 * Единая обёртка над счётчиками.
 *
 * В коде компонентов вызывается только track(). Куда именно уходит событие —
 * забота этого модуля.
 *
 * Счётчики грузятся отложенно: синхронная загрузка в <head> убивает LCP,
 * а это прямо противоречит цели Lighthouse ≥90 из ТЗ.
 *
 * Конфигурация приходит из site.json через data-атрибуты на <body>.
 * Пока analytics.enabled=false, модуль только пишет события в буфер —
 * ничего не грузится и никуда не уходит.
 */

let config = { enabled: false, metrika: '', ga4: '' };
let loaded = false;
const queue = [];

export function track(event, params = {}) {
  if (!config.enabled) return;
  if (!loaded) { queue.push([event, params]); return; }
  send(event, params);
}

function send(event, params) {
  if (config.metrika && typeof window.ym === 'function') {
    window.ym(config.metrika, 'reachGoal', event, params);
  }
  if (config.ga4 && typeof window.gtag === 'function') {
    window.gtag('event', event, params);
  }
}

function loadMetrika(id) {
  window.ym = window.ym || function ym(...args) { (window.ym.a = window.ym.a || []).push(args); };
  window.ym.l = Date.now();

  const s = document.createElement('script');
  s.src = 'https://mc.yandex.ru/metrika/tag.js';
  s.async = true;
  document.head.append(s);

  window.ym(id, 'init', {
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: true,
  });
}

function loadGa4(id) {
  const s = document.createElement('script');
  s.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  s.async = true;
  document.head.append(s);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args) { window.dataLayer.push(args); };
  window.gtag('js', new Date());
  window.gtag('config', id);
}

export function init() {
  const el = document.body;
  config = {
    enabled: el.dataset.analytics === 'on',
    metrika: el.dataset.metrika || '',
    ga4: el.dataset.ga4 || '',
  };
  if (!config.enabled) return;

  const start = () => {
    if (loaded) return;
    loaded = true;
    if (config.metrika) loadMetrika(config.metrika);
    if (config.ga4) loadGa4(config.ga4);
    while (queue.length > 0) send(...queue.shift());
  };

  // Первое взаимодействие или простой — что случится раньше
  const once = { once: true, passive: true };
  addEventListener('pointerdown', start, once);
  addEventListener('keydown', start, once);
  addEventListener('scroll', start, once);

  if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 6000 });
  else setTimeout(start, 4000);
}
