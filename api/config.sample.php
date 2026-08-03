<?php
/**
 * Скопировать в config.php и заполнить. config.php в .gitignore
 * и закрыт правилом в .htaccess — в репозиторий он попасть не должен.
 */

return [
    // Домены, с которых принимаются заявки. Всё остальное отвергается.
    'allowed_origins' => [
        'https://keyframe.example',
        'https://www.keyframe.example',
        'http://localhost:4321',
    ],

    // Telegram: токен у @BotFather, chat_id — у @userinfobot.
    // Для группы chat_id отрицательный, бота нужно в неё добавить.
    'telegram' => [
        'token'   => '',
        'chat_id' => '',
    ],

    // SMTP хостинга. Отправка «от себя себе» проходит спам-фильтры
    // заметно надёжнее, чем подстановка адреса отправителя.
    'mail' => [
        'to'       => 'hello@keyframe.example',
        'from'     => 'robot@keyframe.example',
        'host'     => 'smtp.example.ru',
        'port'     => 465,
        'user'     => 'robot@keyframe.example',
        'password' => '',
        'secure'   => 'ssl',
    ],

    // Задел под amoCRM или Bitrix24: если задан, тот же JSON уходит сюда.
    // Пустая строка отключает.
    'crm_webhook' => '',

    // Каталог вне webroot: резервная запись заявок и счётчик лимита.
    // Путь по умолчанию рассчитан на структуру шаред-хостинга,
    // где public_html лежит внутри домашнего каталога.
    'storage' => __DIR__ . '/../../../storage',

    // Не больше пяти заявок с одного IP за десять минут
    'rate' => ['limit' => 5, 'window' => 600],
];
