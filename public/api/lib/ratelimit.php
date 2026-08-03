<?php
/**
 * Ограничение частоты по IP на файлах.
 *
 * Redis на шаред-хостинге обычно нет, а заявок здесь единицы в день —
 * файла достаточно. IP хранится хешем: сам адрес нам не нужен,
 * а хранить его без причины не стоит.
 */

function kf_rate_ok(string $dir, string $ip, int $limit, int $window): bool
{
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        // Не смогли создать каталог — пропускаем заявку.
        // Потерять живого клиента хуже, чем пропустить лишний запрос.
        return true;
    }

    $file = $dir . '/rate-' . substr(hash('sha256', $ip), 0, 24) . '.json';
    $now  = time();

    $fh = @fopen($file, 'c+');
    if ($fh === false) {
        return true;
    }

    try {
        // Блокировка обязательна: две одновременные заявки иначе
        // перезапишут счётчик друг друга
        if (!flock($fh, LOCK_EX)) {
            return true;
        }

        $raw   = stream_get_contents($fh);
        $stamps = json_decode($raw ?: '[]', true);
        if (!is_array($stamps)) {
            $stamps = [];
        }

        $stamps = array_values(array_filter(
            $stamps,
            static fn($t) => is_int($t) && ($now - $t) < $window
        ));

        if (count($stamps) >= $limit) {
            return false;
        }

        $stamps[] = $now;

        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, json_encode($stamps));
        fflush($fh);

        return true;
    } finally {
        flock($fh, LOCK_UN);
        fclose($fh);
    }
}

function kf_client_ip(): string
{
    // На шаред-хостинге сайт почти всегда за прокси, поэтому смотрим
    // и заголовки. Подделать их можно, но для счётчика этого достаточно.
    foreach (['HTTP_X_REAL_IP', 'HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR'] as $key) {
        if (empty($_SERVER[$key])) {
            continue;
        }
        $value = explode(',', $_SERVER[$key])[0];
        $value = trim($value);
        if (filter_var($value, FILTER_VALIDATE_IP)) {
            return $value;
        }
    }
    return 'unknown';
}
