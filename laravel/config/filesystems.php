<?php

return [
    'default' => 'private',
    'disks' => [
        'private' => [
            'driver' => 'local',
            'root' => storage_path('app/private'),
            'visibility' => 'private',
            'throw' => true,
            'serve' => false,
        ],
    ],
    'links' => [],
];
