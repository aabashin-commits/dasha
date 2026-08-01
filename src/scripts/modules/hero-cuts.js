/**
 * Кадровое полотно героя: жёсткие склейки между остановленными кадрами.
 *
 * Никакого автоплей-шоурила и никакого кроссфейда — это перелистывание
 * шот-листа. Слаглайн и таймкод обновляются вместе с кадром.
 * При prefers-reduced-motion остаётся первый кадр, таймкод статичен.
 */

const CUT_MS = 4200;
const FPS = 24;
const CALM = matchMedia('(prefers-reduced-motion: reduce)');

const pad = (n) => String(n).padStart(2, '0');

function formatTimecode(frames) {
  const s = Math.floor(frames / FPS);
  return [
    pad(Math.floor(s / 3600)),
    pad(Math.floor(s / 60) % 60),
    pad(s % 60),
    pad(frames % FPS),
  ].join(':');
}

export function init() {
  const stage = document.querySelector('[data-stage]');
  const clocks = [...document.querySelectorAll('[data-timecode]')];

  // Таймкод живёт и без героя — он есть на всех страницах в спайне
  if (clocks.length > 0) startClock(clocks);
  if (!stage) return;

  const shots = [...stage.querySelectorAll('[data-shot]')];
  if (shots.length === 0) return;

  const titleEl = stage.querySelector('[data-shot-title]');
  const metaEl = stage.querySelector('[data-shot-meta]');
  const ticksEl = stage.querySelector('[data-ticks]');

  const ticks = shots.map(() => {
    const t = document.createElement('span');
    t.className = 'ticks__item';
    ticksEl?.append(t);
    return t;
  });

  let current = -1;

  const cut = (next) => {
    if (current >= 0) {
      shots[current].classList.remove('stage__shot--active');
      ticks[current].classList.remove('ticks__item--active');
    }
    current = next;
    shots[current].classList.add('stage__shot--active');
    ticks[current].classList.add('ticks__item--active');
    if (titleEl) titleEl.textContent = shots[current].dataset.shotTitle ?? '';
    if (metaEl) metaEl.textContent = shots[current].dataset.shotMeta ?? '';
  };

  cut(0);
  if (CALM.matches) return;

  setInterval(() => {
    if (!document.hidden) cut((current + 1) % shots.length);
  }, CUT_MS);
}

function startClock(clocks) {
  let frames = 0;
  const paint = () => {
    const v = formatTimecode(frames);
    for (const el of clocks) el.textContent = v;
  };
  paint();
  if (CALM.matches) return;

  // Тикаем на 24 кадрах в секунду и замираем, когда вкладка не видна
  setInterval(() => {
    if (document.hidden) return;
    frames++;
    paint();
  }, 1000 / FPS);
}
