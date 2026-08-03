<?php
/** Отправка заявки в Telegram через Bot API. */

function kf_telegram_send(array $cfg, array $data, array $meta): bool
{
    if (empty($cfg['token']) || empty($cfg['chat_id'])) {
        return false;
    }

    $lines = [
        '<b>Новая заявка с сайта</b>',
        '',
        'Имя: <b>' . kf_tg_escape($data['name']) . '</b>',
        'Связь: <b>' . kf_tg_escape($data['contact']) . '</b>',
    ];

    if ($data['service'] !== '') {
        $lines[] = 'Направление: ' . kf_tg_escape($data['service']);
    }
    if ($data['message'] !== '') {
        $lines[] = '';
        $lines[] = kf_tg_escape($data['message']);
    }

    $lines[] = '';
    $lines[] = '<i>' . kf_tg_escape($meta['page'] ?? '') . '</i>';
    $lines[] = '<i>' . date('d.m.Y H:i') . '</i>';

    $res = kf_post_json(
        "https://api.telegram.org/bot{$cfg['token']}/sendMessage",
        [
            'chat_id'    => $cfg['chat_id'],
            'text'       => implode("\n", $lines),
            'parse_mode' => 'HTML',
            'disable_web_page_preview' => true,
        ],
        5
    );

    return $res !== null && ($res['ok'] ?? false) === true;
}

/** Telegram в режиме HTML понимает только эти три сущности. */
function kf_tg_escape(string $v): string
{
    return str_replace(['&', '<', '>'], ['&amp;', '&lt;', '&gt;'], $v);
}

/** @return array<string,mixed>|null */
function kf_post_json(string $url, array $payload, int $timeout): ?array
{
    $body = json_encode($payload, JSON_UNESCAPED_UNICODE);

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $body,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => $timeout,
            CURLOPT_CONNECTTIMEOUT => $timeout,
        ]);
        $out = curl_exec($ch);
        curl_close($ch);
        return $out === false ? null : (json_decode($out, true) ?: null);
    }

    // Запасной путь: на части хостингов curl выключен
    $ctx = stream_context_create([
        'http' => [
            'method'        => 'POST',
            'header'        => "Content-Type: application/json\r\n",
            'content'       => $body,
            'timeout'       => $timeout,
            'ignore_errors' => true,
        ],
    ]);
    $out = @file_get_contents($url, false, $ctx);
    return $out === false ? null : (json_decode($out, true) ?: null);
}
