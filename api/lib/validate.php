<?php
/**
 * Валидация и очистка заявки.
 *
 * Клиентские проверки правятся в devtools за две секунды, поэтому здесь
 * всё проверяется заново и без оглядки на то, что пришло с фронтенда.
 */

/** @return array{0: array<string,string>, 1: array<string,string>} [ошибки, чистые данные] */
function kf_validate(array $in, array $serviceSlugs): array
{
    $errors = [];
    $clean  = [];

    $name = kf_clean($in['name'] ?? '');
    if ($name === '') {
        $errors['name'] = 'Как к вам обращаться?';
    } elseif (mb_strlen($name) < 2) {
        $errors['name'] = 'Слишком коротко';
    } elseif (mb_strlen($name) > 80) {
        $errors['name'] = 'Слишком длинно';
    }
    $clean['name'] = $name;

    $contact = kf_clean($in['contact'] ?? '');
    if ($contact === '') {
        $errors['contact'] = 'Оставьте способ связи';
    } elseif (!kf_is_contact($contact)) {
        $errors['contact'] = 'Похоже на опечатку: нужен email, телефон или @username';
    }
    $clean['contact'] = $contact;

    $message = kf_clean($in['message'] ?? '');
    if (mb_strlen($message) > 2000) {
        $errors['message'] = 'Не больше 2000 символов';
    }
    $clean['message'] = $message;

    // Направление приходит из select — принимаем только известные слаги,
    // иначе в Telegram улетит произвольная строка от отправителя
    $service = kf_clean($in['service'] ?? '');
    $clean['service'] = in_array($service, $serviceSlugs, true) ? $service : '';

    if (empty($in['consent'])) {
        $errors['consent'] = 'Без согласия на обработку данных отправить нельзя';
    }

    return [$errors, $clean];
}

function kf_clean(string $v): string
{
    $v = strip_tags($v);
    $v = str_replace(["\r\n", "\r"], "\n", $v);
    $v = preg_replace('/\n{3,}/', "\n\n", $v);
    // Управляющие символы кроме перевода строки и табуляции
    $v = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $v);
    return trim($v);
}

function kf_is_contact(string $v): bool
{
    if (filter_var($v, FILTER_VALIDATE_EMAIL)) {
        return true;
    }
    if (preg_match('/^@[A-Za-z0-9_]{4,32}$/', $v)) {
        return true;
    }
    $digits = preg_replace('/\D/', '', $v);
    return preg_match('/^\+?[\d\s()-]{10,18}$/', $v) && strlen($digits) >= 10;
}

/** Признаки бота: заполненный ханипот или отправка быстрее трёх секунд. */
function kf_is_bot(array $in): bool
{
    if (!empty($in['company'])) {
        return true;
    }
    $ts = isset($in['ts']) ? (int) $in['ts'] : 0;
    if ($ts <= 0) {
        // Метки нет вовсе — либо бот, либо JS отключён. Пропускаем:
        // терять живого человека хуже, чем принять лишний спам
        return false;
    }
    return (time() * 1000 - $ts) < 3000;
}
