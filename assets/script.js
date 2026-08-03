/* ============================================================
   Keyframe — скрипты сайта

   Один файл без модулей: так страница открывается и с сервера,
   и напрямую с диска. Каждый блок отвечает за свой кусок
   поведения и сам молча выходит, если своих элементов
   на странице нет.
   ============================================================ */

(function () {
  'use strict';

  /* Уважение к системной настройке «меньше движения». Объявлено один
     раз на весь файл: на неё смотрят сразу несколько блоков. */
  var CALM = matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- analytics ---------- */

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

  function track(event, params = {}) {
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

  /** Клики по ссылкам с data-track и глубина скролла — без ручных вызовов. */
  function wireAutoEvents() {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-track]');
      if (el) track(el.dataset.track, { href: el.getAttribute('href') || '' });
    });

    const marks = [
      { at: 0.5, event: 'scroll_50', done: false },
      { at: 0.9, event: 'scroll_90', done: false },
    ];
    let queued = false;

    addEventListener('scroll', () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        const max = document.documentElement.scrollHeight - innerHeight;
        if (max <= 0) return;
        const p = scrollY / max;
        for (const m of marks) {
          if (m.done || p < m.at) continue;
          m.done = true;
          track(m.event);
        }
      });
    }, { passive: true });
  }

  function initAnalytics() {
    const el = document.body;
    config = {
      enabled: el.dataset.analytics === 'on',
      metrika: el.dataset.metrika || '',
      ga4: el.dataset.ga4 || '',
    };

    // События собираем всегда: пока согласия нет, они лежат в буфере
    // и уходят только если человек согласится
    wireAutoEvents();
    if (!config.enabled) return;

    const start = () => {
      if (loaded) return;
      // Без явного согласия счётчики не грузим: это требование 152-ФЗ,
      // а не вопрос вкуса. В приватном режиме Safari localStorage бросает
      // исключение — считаем это отсутствием согласия.
      let granted = false;
      try { granted = localStorage.getItem('kf-cookie-consent') === 'granted'; } catch { /* приватный режим */ }
      if (!granted) return;
      loaded = true;
      if (config.metrika) loadMetrika(config.metrika);
      if (config.ga4) loadGa4(config.ga4);
      while (queue.length > 0) send(...queue.shift());
    };

    addEventListener('kf:consent-granted', start);

    // Первое взаимодействие или простой — что случится раньше.
    // Синхронная загрузка в <head> убила бы LCP.
    const once = { once: true, passive: true };
    addEventListener('pointerdown', start, once);
    addEventListener('keydown', start, once);
    addEventListener('scroll', start, once);

    if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 6000 });
    else setTimeout(start, 4000);
  }

  /* ---------- nav ---------- */

  /**
   * Мобильное меню: бургер, полноэкранный оверлей, ловушка фокуса.
   *
   * Шапка лежит выше меню по z-index, поэтому бургер остаётся кликабельным
   * и превращается в крестик. Без этого меню закрывалось бы только Escape.
   */

  const DESKTOP = 900;

  function initNav() {
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

  /* ---------- spine ---------- */

  /**
   * Сигнатурный таймлайн-спайн.
   *
   * Маркеры ключевых кадров строятся из секций страницы: каждая секция
   * с data-keyframe становится точкой на таймлайне. Плейхед следует за
   * скроллом, активный маркер загорается, по клику страница переходит
   * к секции. Это навигация, а не индикатор прогресса.
   */



  function initSpine() {
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

  /* ---------- hero-cuts ---------- */

  /**
   * Кадровое полотно героя: жёсткие склейки между остановленными кадрами.
   *
   * Никакого автоплей-шоурила и никакого кроссфейда — это перелистывание
   * шот-листа. Слаглайн и таймкод обновляются вместе с кадром.
   * При prefers-reduced-motion остаётся первый кадр, таймкод статичен.
   */

  const CUT_MS = 4200;
  const FPS = 24;


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

  function initHeroCuts() {
    const stage = document.querySelector('[data-stage]');
    const clocks = [...document.querySelectorAll('[data-timecode]')];

    // Таймкод живёт и без героя — он есть на всех страницах в спайне
    if (clocks.length > 0) startClock(clocks);
    if (!stage) return;

    const shots = [...stage.querySelectorAll('[data-shot]')];
    if (shots.length === 0) return;

    // Имена атрибутов у подписи и у кадров разные намеренно: когда они
    // совпадали, querySelector находил первым <img>, и подпись никогда
    // не обновлялась — текст молча уходил в атрибут картинки
    const titleEl = stage.querySelector('[data-caption-title]');
    const metaEl = stage.querySelector('[data-caption-meta]');
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

  /* ---------- works-filter ---------- */

  /**
   * Фильтр портфолио по направлению.
   *
   * Карточки скрываются, а не удаляются и не подгружаются: все работы
   * присутствуют в HTML, иначе фильтрация съедает индексацию.
   *
   * Состояние живёт в ?service= через replaceState — ссылку на отфильтрованное
   * портфолио можно отправить, но история браузера не засоряется.
   */


  const ALL = 'all';

  function initWorksFilter() {
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

  /* ---------- video-facade ---------- */

  /**
   * Подстановка плеера по клику.
   *
   * До клика на странице только постер: один embed VK или Rutube тянет около
   * мегабайта скриптов и портит LCP на странице, где видео могут не запустить.
   */


  function initVideoFacade() {
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

  /* ---------- lightbox ---------- */

  /**
   * Лайтбокс галереи кейса: клавиатура, свайп, ловушка фокуса.
   *
   * Разметка создаётся здесь, а не в шаблоне: без JS галерея остаётся
   * обычной сеткой картинок, и пустой оверлей в HTML был бы мусором.
   */


  const SWIPE_MIN = 40;

  function initLightbox() {
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

  /* ---------- form ---------- */

  /**
   * Отправка заявки.
   *
   * Валидация здесь дублирует серверную, но не заменяет её: клиентский код
   * правится в devtools за две секунды. Задача этой копии — не пускать
   * человека на сервер с очевидно неполной формой.
   */


  const TIMEOUT = 15000;

  const RULES = {
    name: (v) => {
      if (!v) return 'Как к вам обращаться?';
      if (v.length < 2) return 'Слишком коротко';
      if (v.length > 80) return 'Слишком длинно';
      return '';
    },
    contact: (v) => {
      if (!v) return 'Оставьте способ связи';
      const email = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
      const phone = /^\+?[\d\s()-]{10,18}$/;
      const tg = /^@[\w]{4,32}$/;
      if (email.test(v) || phone.test(v) || tg.test(v)) return '';
      return 'Похоже на опечатку: нужен email, телефон или @username';
    },
    message: (v) => (v.length > 2000 ? 'Не больше 2000 символов' : ''),
  };

  function initForm() {
    for (const form of document.querySelectorAll('[data-lead-form]')) setup(form);
  }

  function setup(form) {
    const status = form.querySelector('[data-form-status]');
    const submit = form.querySelector('[data-submit]');
    const submitText = form.querySelector('[data-submit-text]');
    const consent = form.querySelector('[name="consent"]');
    const label = submitText?.textContent ?? 'Отправить';

    // Метка времени рендера: форма, отправленная быстрее трёх секунд,
    // почти наверняка заполнена ботом
    const stamp = document.createElement('input');
    stamp.type = 'hidden';
    stamp.name = 'ts';
    stamp.value = String(Date.now());
    form.append(stamp);

    let started = false;
    form.addEventListener('input', () => {
      if (started) return;
      started = true;
      track('form_start');
    }, { once: true });

    const showError = (field, text) => {
      const box = form.querySelector(`[data-error-for="${field}"]`);
      const input = form.elements[field];
      if (box) box.textContent = text;
      if (input) input.setAttribute('aria-invalid', text ? 'true' : 'false');
    };

    const clearErrors = () => {
      for (const box of form.querySelectorAll('[data-error-for]')) box.textContent = '';
      for (const el of form.querySelectorAll('[aria-invalid]')) el.setAttribute('aria-invalid', 'false');
    };

    // Ошибку убираем, как только человек начал править поле:
    // держать её до повторной отправки — значит ругаться на уже исправленное
    form.addEventListener('input', (e) => {
      const name = e.target.name;
      if (name in RULES) showError(name, '');
    });

    const setBusy = (busy) => {
      submit.disabled = busy;
      if (!submitText) return;
      submitText.textContent = busy ? 'Отправляем' : label;
      const spinner = submit.querySelector('.btn__spinner');
      if (busy && !spinner) {
        submit.prepend(Object.assign(document.createElement('span'), { className: 'btn__spinner' }));
      } else if (!busy) {
        spinner?.remove();
      }
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors();
      status.className = 'form__status';
      status.textContent = '';

      const data = Object.fromEntries(new FormData(form));
      let bad = null;

      for (const [field, rule] of Object.entries(RULES)) {
        const error = rule((data[field] ?? '').trim());
        if (!error) continue;
        showError(field, error);
        bad = bad ?? field;
      }
      if (!consent?.checked) {
        status.className = 'form__status form__status--error';
        status.textContent = 'Без согласия на обработку данных отправить не получится';
        bad = bad ?? 'consent';
      }

      if (bad) {
        form.elements[bad]?.focus();
        track('form_error', { reason: 'validation' });
        return;
      }

      track('form_submit', { service: data.service || 'none' });
      setBusy(true);

      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), TIMEOUT);

      try {
        const res = await fetch(form.action, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
          signal: abort.signal,
        });
        const json = await res.json().catch(() => ({ ok: false }));

        if (json.ok) {
          form.reset();
          status.className = 'form__status form__status--ok';
          status.innerHTML = `<div class="form__status-title">${escapeHtml(form.dataset.successTitle)}</div>`
            + `<div>${escapeHtml(form.dataset.successText)}</div>`;
          track('form_success', { service: data.service || 'none' });
          return;
        }

        if (json.errors) {
          for (const [field, text] of Object.entries(json.errors)) showError(field, text);
          form.elements[Object.keys(json.errors)[0]]?.focus();
        } else {
          fail(form, status);
        }
        track('form_error', { reason: 'server' });
      } catch {
        // Сеть отвалилась или вышел таймаут — даём живой запасной канал,
        // иначе заявка просто теряется
        fail(form, status);
        track('form_error', { reason: 'network' });
      } finally {
        clearTimeout(timer);
        setBusy(false);
      }
    });
  }

  function fail(form, status) {
    const tg = form.dataset.telegram;
    status.className = 'form__status form__status--error';
    status.innerHTML = `${escapeHtml(form.dataset.errorText)} `
      + `<a href="https://t.me/${encodeURIComponent(tg)}">Написать в Telegram</a>`;
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  /* ---------- cookie ---------- */

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

  const consent = () => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      // Приватный режим Safari: localStorage бросает исключение.
      // Считаем, что согласия нет, но и баннер каждый раз не показываем
      return 'unavailable';
    }
  };

  function initCookie() {
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

  /* ---------- reveal ---------- */

  /**
   * Появление секций при скролле.
   *
   * Класс .reveal скрывает элемент только под .js на <html> — его ставит
   * инлайн-скрипт в начале <body>. Если JavaScript не выполнился, страница
   * остаётся полностью читаемой.
   */



  function initReveal() {
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

  /* ---------- запуск ---------- */

  var STARTERS = [
    initAnalytics,
    initNav,
    initSpine,
    initHeroCuts,
    initWorksFilter,
    initVideoFacade,
    initLightbox,
    initForm,
    initCookie,
    initReveal
  ];

  for (var i = 0; i < STARTERS.length; i++) {
    try {
      STARTERS[i]();
    } catch (e) {
      // Падение одного блока не должно уносить остальные
      console.error('[keyframe]', e);
    }
  }
})();
