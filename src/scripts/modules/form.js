/**
 * Отправка заявки.
 *
 * Валидация здесь дублирует серверную, но не заменяет её: клиентский код
 * правится в devtools за две секунды. Задача этой копии — не пускать
 * человека на сервер с очевидно неполной формой.
 */

import { track } from './analytics.js';

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

export function init() {
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
