<?php
/* ==========================================================================
   BONGSHAI STEEL — CMS CONFIG (SAMPLE)
   --------------------------------------------------------------------------
   1. Copy this file to  admin/config.php
   2. Set 'password_hash' to a real hash. Two ways:
        a) open  https://your-site/admin/setup.php  in a browser (easiest), or
        b) run   php -r "echo password_hash('YOUR-PASSWORD', PASSWORD_DEFAULT);"
           and paste the output below.
   3. Delete admin/setup.php once done.

   config.php is git-ignored, so cPanel auto-pull deploys never overwrite it.
   ========================================================================== */

return [
    // Sign-in name. Case is ignored when it is checked.
    'username'      => 'REPLACE_WITH_USERNAME',

    // bcrypt/argon2 hash of that user's password.
    // The literal placeholder below never validates against any password.
    'password_hash' => 'REPLACE_WITH_HASH',

    // Live content store — git-ignored, survives deploys. apply.js reads it.
    'content_file'  => dirname(__DIR__) . '/data/content.json',
    'default_file'  => dirname(__DIR__) . '/data/content.default.json',

    // Timestamped snapshots taken before every save.
    'backup_dir'    => __DIR__ . '/backups',
    'keep_backups'  => 15,

    // Editor image uploads.
    'upload_dir'    => dirname(__DIR__) . '/images/uploads',
    'upload_url'    => 'images/uploads',
    'max_upload'    => 8 * 1024 * 1024, // 8 MB

    // Session cookie name.
    'session_name'  => 'bs_cms',

    // Sign-in throttle: this many failures from one IP locks it out for
    // 'lockout' seconds. Locked out by accident? Delete admin/backups/.throttle.json.
    'max_attempts'  => 8,
    'lockout'       => 900,      // 15 min

    // Session lifetime.
    'idle_limit'    => 7200,     // 2 h with no request
    'session_limit' => 43200,    // 12 h total

    // Request limits.
    'max_pixels'    => 40000000, // reject decompression-bomb images (40 MP)
    'max_body'      => 4194304,  // largest accepted save payload (4 MB)
];
