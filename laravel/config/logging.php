<?php

use Monolog\Handler\NullHandler;
use Monolog\Handler\StreamHandler;
use Monolog\Level;

return [
    'default' => env('LOG_CHANNEL', 'stderr'),
    'deprecations' => [
        'channel' => env('LOG_DEPRECATIONS_CHANNEL', 'null'),
        'trace' => false,
    ],
    'channels' => [
        'stderr' => [
            'driver' => 'monolog',
            'level' => env('LOG_LEVEL', 'warning'),
            'handler' => StreamHandler::class,
            'with' => ['stream' => 'php://stderr'],
            'formatter' => env('LOG_STDERR_FORMATTER'),
            'processors' => [],
        ],
        'null' => [
            'driver' => 'monolog',
            'handler' => NullHandler::class,
        ],
    ],
];
