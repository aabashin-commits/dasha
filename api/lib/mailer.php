<?php
/**
 * Отправка письма.
 *
 * Порядок такой: SMTP хостинга, если он настроен, иначе mail().
 * SMTP предпочтительнее — письма от mail() чаще уходят в спам,
 * потому что отправляются без аутентификации.
 *
 * PHPMailer сознательно не используется: ради одного текстового письма
 * тащить в репозиторий вендорный каталог избыточно.
 */

function kf_mail_send(array $cfg, array $data, array $meta): bool
{
    if (empty($cfg['to'])) {
        return false;
    }

    $subject = 'Заявка с сайта: ' . $data['name'];
    $body = implode("\n", array_filter([
        'Имя: ' . $data['name'],
        'Связь: ' . $data['contact'],
        $data['service'] !== '' ? 'Направление: ' . $data['service'] : null,
        '',
        $data['message'] !== '' ? $data['message'] : '(без сообщения)',
        '',
        '---',
        'Страница: ' . ($meta['page'] ?? ''),
        'Время: ' . date('d.m.Y H:i'),
    ], static fn($l) => $l !== null));

    if (!empty($cfg['host']) && !empty($cfg['user'])) {
        return kf_smtp_send($cfg, $subject, $body);
    }

    $headers = implode("\r\n", [
        'From: ' . ($cfg['from'] ?: $cfg['to']),
        'Reply-To: ' . ($cfg['from'] ?: $cfg['to']),
        'Content-Type: text/plain; charset=UTF-8',
        'MIME-Version: 1.0',
    ]);

    // Заголовок кодируется по RFC 2047: кириллица в теме иначе
    // приезжает в почтовый клиент мусором
    $encoded = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    return @mail($cfg['to'], $encoded, $body, $headers);
}

function kf_smtp_send(array $cfg, string $subject, string $body): bool
{
    $secure = $cfg['secure'] ?? 'ssl';
    $host   = ($secure === 'ssl' ? 'ssl://' : '') . $cfg['host'];
    $port   = (int) ($cfg['port'] ?? 465);

    $fp = @stream_socket_client("$host:$port", $errno, $errstr, 10);
    if (!$fp) {
        return false;
    }

    $read = static function () use ($fp): string {
        $out = '';
        while (($line = fgets($fp, 515)) !== false) {
            $out .= $line;
            // Последняя строка ответа: код, пробел, текст
            if (strlen($line) < 4 || $line[3] === ' ') {
                break;
            }
        }
        return $out;
    };
    $say = static function (string $cmd) use ($fp, $read): string {
        fwrite($fp, $cmd . "\r\n");
        return $read();
    };

    try {
        $read();
        $say('EHLO ' . ($_SERVER['SERVER_NAME'] ?? 'localhost'));

        if ($secure === 'tls') {
            $say('STARTTLS');
            if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                return false;
            }
            $say('EHLO ' . ($_SERVER['SERVER_NAME'] ?? 'localhost'));
        }

        $say('AUTH LOGIN');
        $say(base64_encode($cfg['user']));
        $auth = $say(base64_encode($cfg['password'] ?? ''));
        if (strpos($auth, '235') !== 0) {
            return false;
        }

        $say('MAIL FROM:<' . ($cfg['from'] ?: $cfg['user']) . '>');
        $say('RCPT TO:<' . $cfg['to'] . '>');
        $say('DATA');

        $headers = implode("\r\n", [
            'From: Keyframe <' . ($cfg['from'] ?: $cfg['user']) . '>',
            'To: <' . $cfg['to'] . '>',
            'Subject: =?UTF-8?B?' . base64_encode($subject) . '?=',
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
            '',
            chunk_split(base64_encode($body)),
        ]);

        $sent = $say($headers . "\r\n.");
        $say('QUIT');

        return strpos($sent, '250') === 0;
    } finally {
        fclose($fp);
    }
}
