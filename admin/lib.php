<?php
/* ==========================================================================
   BONGSHAI STEEL — CMS SHARED LIBRARY
   Flat-file, no database. Mirrors the counter.php philosophy.
   ========================================================================== */
declare(strict_types=1);

/* --------------------------------------------------------------------------
   CONFIG
   -------------------------------------------------------------------------- */
function cms_config_raw(): ?array
{
    $path = __DIR__ . '/config.php';
    if (!is_file($path)) return null;
    $cfg = require $path;
    return is_array($cfg) ? $cfg : null;
}

function cms_config_ready(?array $cfg = null): bool
{
    $cfg = $cfg ?? cms_config_raw();
    return is_array($cfg)
        && !empty($cfg['password_hash'])
        && $cfg['password_hash'] !== 'REPLACE_WITH_HASH';
}

/** Config for API endpoints — emits JSON + exits when unusable. */
function cms_config(): array
{
    $cfg = cms_config_raw();
    if ($cfg === null) {
        cms_fail(500, 'config_missing',
            'admin/config.php not found. Copy admin/config.sample.php to admin/config.php, then open admin/setup.php.');
    }
    if (!cms_config_ready($cfg)) {
        cms_fail(500, 'config_incomplete',
            'admin/config.php has no password hash yet. Open admin/setup.php in your browser.');
    }
    return $cfg + cms_config_defaults();
}

function cms_config_defaults(): array
{
    return [
        'content_file' => dirname(__DIR__) . '/data/content.json',
        'default_file' => dirname(__DIR__) . '/data/content.default.json',
        'backup_dir'   => __DIR__ . '/backups',
        'keep_backups' => 15,
        'upload_dir'   => dirname(__DIR__) . '/images/uploads',
        'upload_url'   => 'images/uploads',
        'max_upload'   => 8 * 1024 * 1024,
        'session_name' => 'bs_cms',

        // Sign-in throttle.
        'max_attempts' => 8,        // failed sign-ins before a lockout
        'lockout'      => 900,      // seconds locked out, and the window failures are counted in

        // Session lifetime.
        'idle_limit'   => 7200,     // seconds of inactivity before sign-out
        'session_limit'=> 43200,    // absolute lifetime of one sign-in

        // Request limits.
        'max_pixels'   => 40000000, // reject decompression-bomb images
        'max_body'     => 4194304,  // largest accepted save payload
    ];
}

/* --------------------------------------------------------------------------
   SESSION / AUTH
   -------------------------------------------------------------------------- */
function cms_session_start(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $cfg = cms_config_raw() ?: [];
    session_name($cfg['session_name'] ?? 'bs_cms');
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'httponly' => true,
        'samesite' => 'Lax',
        'secure'   => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
    ]);
    session_start();
}

function cms_session_destroy(): void
{
    cms_session_start();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    session_destroy();
}

/** Called once, on a correct password. */
function cms_session_open(): void
{
    cms_session_start();
    session_regenerate_id(true);
    $_SESSION['cms_ok']      = true;
    $_SESSION['cms_started'] = time();
    $_SESSION['cms_seen']    = time();
}

function cms_is_authed(): bool
{
    cms_session_start();
    if (empty($_SESSION['cms_ok'])) return false;

    $cfg     = (cms_config_raw() ?: []) + cms_config_defaults();
    $now     = time();
    $started = (int) ($_SESSION['cms_started'] ?? $now);
    $seen    = (int) ($_SESSION['cms_seen'] ?? $now);

    if (($now - $started) > (int) $cfg['session_limit'] || ($now - $seen) > (int) $cfg['idle_limit']) {
        cms_session_destroy();
        return false;
    }
    $_SESSION['cms_seen'] = $now;
    return true;
}

function cms_require_auth(): void
{
    if (!cms_is_authed()) cms_fail(403, 'unauthorized', 'Not signed in.');
}

/* --------------------------------------------------------------------------
   REQUEST HARDENING
   -------------------------------------------------------------------------- */
function cms_security_headers(bool $html = false): void
{
    if (headers_sent()) return;
    header('X-Content-Type-Options: nosniff');
    // Not no-referrer: Chrome mirrors the referrer policy into the Origin header
    // of a navigational form POST, so no-referrer made our own sign-in form
    // arrive as Origin: null and fail the check below. same-origin still sends
    // nothing to other sites.
    header('Referrer-Policy: same-origin');
    header('X-Frame-Options: DENY');
    header('X-Robots-Tag: noindex, nofollow');
    if ($html) {
        header("Content-Security-Policy: default-src 'self'; img-src 'self' data:; "
             . "style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; "
             . "base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    }
}

/**
 * The session cookie is already SameSite=Lax; this is the second lock on it.
 * A stripped Origin/Referer is accepted — some proxies remove it, and the
 * cookie policy still stands on its own.
 */
function cms_same_origin(): bool
{
    // Sec-Fetch-Site is set by the browser and is a forbidden header name, so
    // no page can forge it. Where it exists it is the better answer, and it is
    // immune to the Origin: null that a strict referrer policy produces on a
    // form navigation.
    $site = strtolower((string) ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? ''));
    if ($site !== '') {
        return $site === 'same-origin' || $site === 'none';
    }

    // Older browsers and plain HTTP clients: fall back to Origin, then Referer.
    $host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
    $sent = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    if ($sent === '') $sent = (string) ($_SERVER['HTTP_REFERER'] ?? '');
    if ($sent === '' || $host === '') return true;
    if ($sent === 'null') return false;

    $parts = parse_url($sent);
    if (empty($parts['host'])) return false;
    $seen = strtolower($parts['host']) . (isset($parts['port']) ? ':' . $parts['port'] : '');
    return $seen === $host || strtolower($parts['host']) === preg_replace('/:\d+$/', '', $host);
}

function cms_require_same_origin(): void
{
    if (!cms_same_origin()) cms_fail(403, 'cross_site', 'Cross-site request blocked.');
}

/* --------------------------------------------------------------------------
   SIGN-IN THROTTLE  (flat file in the backup dir, keyed by client IP)
   -------------------------------------------------------------------------- */
function cms_throttle_file(): string
{
    $cfg = (cms_config_raw() ?: []) + cms_config_defaults();
    $dir = $cfg['backup_dir'];
    if (!is_dir($dir)) @mkdir($dir, 0775, true);
    if (is_dir($dir) && !is_file($dir . '/.htaccess')) {
        @file_put_contents($dir . '/.htaccess', "Require all denied\n");
    }
    return $dir . '/.throttle.json';
}

function cms_throttle_key(): string
{
    // REMOTE_ADDR only. X-Forwarded-For and friends are caller-supplied.
    return substr(hash('sha256', (string) ($_SERVER['REMOTE_ADDR'] ?? '?')), 0, 16);
}

function cms_throttle_read(): array
{
    $f = cms_throttle_file();
    if (!is_file($f)) return [];
    $j = json_decode((string) @file_get_contents($f), true);
    return is_array($j) ? $j : [];
}

/** Seconds left on this client's lockout, or 0 when a sign-in may be tried. */
function cms_throttle_locked(): int
{
    $cfg = (cms_config_raw() ?: []) + cms_config_defaults();
    $rec = cms_throttle_read()[cms_throttle_key()] ?? null;
    if (!is_array($rec) || (int) ($rec['n'] ?? 0) < max(1, (int) $cfg['max_attempts'])) return 0;
    $left = max(60, (int) $cfg['lockout']) - (time() - (int) ($rec['last'] ?? 0));
    return $left > 0 ? $left : 0;
}

function cms_throttle_note(bool $failed): void
{
    $cfg  = (cms_config_raw() ?: []) + cms_config_defaults();
    $span = max(60, (int) $cfg['lockout']);
    $now  = time();
    $key  = cms_throttle_key();
    $all  = cms_throttle_read();

    // Drop stale entries so the file cannot grow without bound.
    foreach ($all as $k => $v) {
        if (!is_array($v) || ($now - (int) ($v['last'] ?? 0)) > $span) unset($all[$k]);
    }
    if ($failed) {
        $all[$key] = ['n' => (int) ($all[$key]['n'] ?? 0) + 1, 'last' => $now];
    } else {
        unset($all[$key]);
    }
    @file_put_contents(cms_throttle_file(), json_encode($all), LOCK_EX);
}

/* --------------------------------------------------------------------------
   JSON RESPONSES
   -------------------------------------------------------------------------- */
function cms_fail(int $code, string $error, string $message): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => $error, 'message' => $message]);
    exit;
}

function cms_ok(array $data = []): void
{
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => true] + $data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

/* --------------------------------------------------------------------------
   CONTENT STORE
   -------------------------------------------------------------------------- */
function cms_read_content(): array
{
    $cfg = cms_config();
    foreach ([$cfg['content_file'], $cfg['default_file']] as $f) {
        if (is_file($f)) {
            $j = json_decode((string) file_get_contents($f), true);
            if (is_array($j)) return $j;
        }
    }
    return [];
}

function cms_write_content(array $content): array
{
    $cfg = cms_config();
    $dir = dirname($cfg['content_file']);
    if (!is_dir($dir)) @mkdir($dir, 0775, true);
    if (!is_dir($dir) || !is_writable($dir)) {
        cms_fail(500, 'not_writable', "Cannot write to $dir — set its permissions to 775.");
    }

    // Snapshot the current file before overwriting.
    if (is_file($cfg['content_file'])) {
        if (!is_dir($cfg['backup_dir'])) @mkdir($cfg['backup_dir'], 0775, true);
        @file_put_contents($cfg['backup_dir'] . '/.htaccess', "Require all denied\n");
        @copy($cfg['content_file'], $cfg['backup_dir'] . '/content-' . gmdate('Ymd-His') . '.json');
        cms_prune_backups($cfg['backup_dir'], (int) ($cfg['keep_backups'] ?? 15));
    }

    $content['version'] = $content['version'] ?? 1;
    $content['updated'] = gmdate('c');

    $json = json_encode($content, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($json === false) cms_fail(400, 'encode_failed', json_last_error_msg());

    $tmp = $cfg['content_file'] . '.tmp';
    if (file_put_contents($tmp, $json, LOCK_EX) === false || !@rename($tmp, $cfg['content_file'])) {
        @unlink($tmp);
        cms_fail(500, 'write_failed', 'Could not write data/content.json.');
    }
    return $content;
}

function cms_prune_backups(string $dir, int $keep): void
{
    $files = glob($dir . '/content-*.json') ?: [];
    if (count($files) <= $keep) return;
    usort($files, fn($a, $b) => filemtime($b) <=> filemtime($a));
    foreach (array_slice($files, $keep) as $old) @unlink($old);
}

/* --------------------------------------------------------------------------
   IMAGE UPLOAD  (GD -> .webp + -400w/-700w variants, graceful fallback)
   -------------------------------------------------------------------------- */
function cms_handle_upload(): void
{
    $cfg = cms_config();

    if (empty($_FILES['file']) || !is_array($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        cms_fail(400, 'no_file', 'No file received (or it exceeded the server upload limit).');
    }
    $f = $_FILES['file'];
    if (($f['size'] ?? 0) > ($cfg['max_upload'] ?? 8388608)) {
        cms_fail(413, 'too_big', 'Image is larger than the ' . round(($cfg['max_upload'] ?? 8388608) / 1048576) . ' MB limit.');
    }
    if (!is_uploaded_file($f['tmp_name'])) cms_fail(400, 'bad_upload', 'Invalid upload.');

    $info = @getimagesize($f['tmp_name']);
    if ($info === false) cms_fail(400, 'not_image', 'That file is not a readable image.');
    [$w, $h] = $info;
    $mime = strtolower((string) ($info['mime'] ?? ''));

    // Allowlist, not "whatever getimagesize recognised" — BMP/TIFF/ICO and the
    // like used to fall through to the fallback branch and land on disk as .img.
    $allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];
    if (!isset($allowed[$mime])) {
        cms_fail(415, 'bad_type', 'Only JPEG, PNG, WebP and GIF images can be uploaded.');
    }
    $maxPx = (int) ($cfg['max_pixels'] ?? 40000000);
    if ($w * $h > $maxPx) {
        cms_fail(413, 'too_many_pixels',
            'That image is ' . round($w * $h / 1000000, 1) . ' megapixels — resize it below '
            . round($maxPx / 1000000) . ' MP before uploading.');
    }

    $dir = $cfg['upload_dir'];
    if (!is_dir($dir)) @mkdir($dir, 0775, true);
    if (!is_dir($dir) || !is_writable($dir)) {
        cms_fail(500, 'not_writable', "images/uploads is not writable — set it to 775.");
    }
    cms_guard_upload_dir($dir);

    $stem = strtolower(preg_replace('/[^a-z0-9]+/i', '-', pathinfo($f['name'], PATHINFO_FILENAME)) ?: 'image');
    $stem = trim($stem, '-') ?: 'image';
    $stem .= '-' . substr(bin2hex(random_bytes(5)), 0, 8);

    $src = null;
    if (function_exists('imagecreatefromstring')) {
        $src = @imagecreatefromstring((string) file_get_contents($f['tmp_name']));
        // GD is installed and still refused the bytes, so the file is damaged.
        // Without this the fallback branch below would store the junk verbatim,
        // which only makes sense on a host that has no GD at all.
        if ($src === false) {
            cms_fail(400, 'not_image', 'That image is damaged or incomplete — try re-saving it.');
        }
    }

    $widths = [];
    if ($src && function_exists('imagewebp')) {
        if (function_exists('imagepalettetotruecolor')) @imagepalettetotruecolor($src);
        @imagealphablending($src, true);

        $relFull = $cfg['upload_url'] . '/' . $stem . '.webp';
        @imagewebp($src, $dir . '/' . $stem . '.webp', 82);

        foreach ([400, 700] as $tw) {
            if ($w <= $tw) continue;
            $th  = max(1, (int) round($h * $tw / $w));
            $dst = imagecreatetruecolor($tw, $th);
            imagecopyresampled($dst, $src, 0, 0, 0, 0, $tw, $th, $w, $h);
            @imagewebp($dst, $dir . '/' . $stem . "-{$tw}w.webp", 80);
            imagedestroy($dst);
            $widths[] = $tw;
        }
        imagedestroy($src);
        cms_ok(['path' => $relFull, 'widths' => $widths, 'variants' => true]);
    }

    // Fallback: no GD/webp support — keep the original bytes.
    $ext = $allowed[$mime];
    $relFull = $cfg['upload_url'] . '/' . $stem . '.' . $ext;
    if (!move_uploaded_file($f['tmp_name'], $dir . '/' . $stem . '.' . $ext)) {
        cms_fail(500, 'move_failed', 'Could not store the uploaded file.');
    }
    cms_ok(['path' => $relFull, 'widths' => [], 'variants' => false,
            'note' => 'Server has no GD/WebP support — stored full-size only, no responsive variants.']);
}

/** Drop an .htaccess into images/uploads so nothing stored there can execute. */
function cms_guard_upload_dir(string $dir): void
{
    $f = $dir . '/.htaccess';
    if (is_file($f)) return;
    // No `Options` directive here on purpose: if the host disallows it Apache
    // 500s the whole folder, and every image on the site goes with it.
    @file_put_contents($f, <<<'HT'
# Written by the CMS. Uploaded images only — never execute anything here.
<IfModule mod_mime.c>
  RemoveHandler .php .phtml .phar .php3 .php4 .php5 .php7 .php8 .cgi .pl .py .sh
  RemoveType .php .phtml .phar .php3 .php4 .php5 .php7 .php8 .cgi .pl .py .sh
</IfModule>
<FilesMatch "\.(?i:php[0-9s]?|phtml|phar|cgi|pl|py|sh|htaccess)$">
  <IfModule mod_authz_core.c>
    Require all denied
  </IfModule>
  <IfModule !mod_authz_core.c>
    Order allow,deny
    Deny from all
  </IfModule>
</FilesMatch>
<IfModule mod_headers.c>
  Header set X-Content-Type-Options "nosniff"
</IfModule>
HT);
}

/* --------------------------------------------------------------------------
   BACKUPS
   -------------------------------------------------------------------------- */
function cms_backup_name_ok(string $id): bool
{
    return (bool) preg_match('/^content-\d{8}-\d{6}\.json$/', $id);
}

function cms_backups_list(): array
{
    $cfg = cms_config();
    $out = [];
    foreach (glob($cfg['backup_dir'] . '/content-*.json') ?: [] as $f) {
        $id = basename($f);
        if (!cms_backup_name_ok($id)) continue;
        $out[] = ['id' => $id, 'when' => gmdate('c', (int) filemtime($f)), 'size' => (int) filesize($f)];
    }
    // Newest first. The name is a UTC timestamp, so a string sort is enough.
    usort($out, fn($a, $b) => strcmp($b['id'], $a['id']));
    return $out;
}

function cms_restore_backup(string $id): array
{
    $cfg = cms_config();
    // The pattern is basename-shaped, so no traversal can get through it.
    if (!cms_backup_name_ok($id)) cms_fail(400, 'bad_id', 'That is not a snapshot file name.');
    $path = $cfg['backup_dir'] . '/' . $id;
    if (!is_file($path)) cms_fail(404, 'no_backup', 'That snapshot is no longer on the server.');
    $j = json_decode((string) file_get_contents($path), true);
    if (!is_array($j)) cms_fail(422, 'bad_backup', 'That snapshot is not readable JSON.');
    return cms_write_content($j);   // snapshots the current content first
}
