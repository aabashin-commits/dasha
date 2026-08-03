<?php
/**
 * Приём заявки с сайта.
 *
 * Порядок шагов из ТЗ (раздел 10.1) соблюдается строго: сначала дешёвые
 * отсечки, потом дорогие сетевые вызовы. Проверять валидность после
 * отправки в Telegram — значит платить за спам трафиком.
 *
 * Секреты берутся из config.php, которого нет в репозитории.
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

require __DIR__ . '/lib/validate.php';
require __DIR__ . '/lib/ratelimit.php';
require __DIR__ . '/lib/telegram.php';
require __DIR__ . '/lib/mailer.php';

/** Наружу никогда не уходят детали: они только в логе. */
function kf_fail(int $code, string $log = ''): never
{
    http_response_code($code);
    if ($log !== '') {
        error_log('[lead] ' . $log);
    }
    echo json_encode(['ok' => false], JSON_UNESCAPED_UNICODE);
    exit;
}

/* 1. Только POST с JSON */
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    kf_fail(405);
}

$configFile = __DIR__ . '/config.php';
if (!is_file($configFile)) {
    kf_fail(500, 'нет config.php — скопируйте config.sample.php');
}
$cfg = require $configFile;

/* 2. Origin или Referer из белого списка */
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin === '' && !empty($_SERVER['HTTP_REFERER'])) {
    $parts = parse_url($_SERVER['HTTP_REFERER']);
    if (!empty($parts['scheme']) && !empty($parts['host'])) {
        $origin = $parts['scheme'] . '://' . $parts['host']
            . (isset($parts['port']) ? ':' . $parts['port'] : '');
    }
}
if (!in_array($origin, $cfg['allowed_origins'], true)) {
    kf_fail(403, 'origin отвергнут: ' . $origin);
}

$raw = file_get_contents('php://input') ?: '';
if (strlen($raw) > 20000) {
    kf_fail(413, 'тело запроса слишком большое');
}
$in = json_decode($raw, true);
if (!is_array($in)) {
    kf_fail(400, 'тело не разобралось как JSON');
}

/* 3–4. Ханипот и метка времени.
   Боту отвечаем успехом: сигнал «поле распознано» научил бы его обходить. */
if (kf_is_bot($in)) {
    error_log('[lead] отсечён как бот');
    echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

/* 5. Ограничение частоты */
$storage = $cfg['storage'];
if (!kf_rate_ok($storage, kf_client_ip(), $cfg['rate']['limit'], $cfg['rate']['window'])) {
    http_response_code(429);
    echo json_encode([
        'ok' => false,
        'error' => 'Слишком много заявок подряд. Попробуйте через десять минут.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

/* 6–7. Валидация и очистка */
$serviceSlugs = ['reels', 'event-production', 'documentary', 'memory-films'];
[$errors, $data] = kf_validate($in, $serviceSlugs);

if ($errors !== []) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'errors' => $errors], JSON_UNESCAPED_UNICODE);
    exit;
}

$meta = [
    'page' => kf_clean((string) ($in['page'] ?? ($_SERVER['HTTP_REFERER'] ?? ''))),
    'ip'   => kf_client_ip(),
];

/* 10. Резервная запись — до сетевых вызовов.
   Если Telegram и почта упадут, заявка всё равно останется. */
$archived = kf_archive($storage, $data, $meta);

/* 8–9. Telegram и почта */
$sentTelegram = kf_telegram_send($cfg['telegram'], $data, $meta);
$sentMail     = kf_mail_send($cfg['mail'], $data, $meta);

/* 11. Хук CRM — задел под amoCRM и Bitrix24 */
if (!empty($cfg['crm_webhook'])) {
    kf_post_json($cfg['crm_webhook'], $data + ['source' => 'website'], 5);
}

/* 12. Ответ */
if (!$sentTelegram && !$sentMail && !$archived) {
    kf_fail(502, 'ни один канал доставки не сработал');
}
if (!$sentTelegram && !$sentMail) {
    error_log('[lead] Telegram и почта недоступны, заявка только в архиве');
}

echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);

/** Дописывает заявку в CSV вне webroot. */
function kf_archive(string $dir, array $data, array $meta): bool
{
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        return false;
    }
    $file = $dir . '/leads.csv';
    $new  = !is_file($file);

    $fh = @fopen($file, 'a');
    if ($fh === false) {
        return false;
    }
    try {
        if (!flock($fh, LOCK_EX)) {
            return false;
        }
        if ($new) {
            fputcsv($fh, ['дата', 'имя', 'связь', 'направление', 'сообщение', 'страница']);
        }
        fputcsv($fh, [
            date('Y-m-d H:i:s'),
            $data['name'],
            $data['contact'],
            $data['service'],
            $data['message'],
            $meta['page'],
        ]);
        return true;
    } finally {
        flock($fh, LOCK_UN);
        fclose($fh);
    }
}
