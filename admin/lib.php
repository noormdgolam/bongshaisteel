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

function cms_is_authed(): bool
{
    cms_session_start();
    return !empty($_SESSION['cms_ok']);
}

function cms_require_auth(): void
{
    if (!cms_is_authed()) cms_fail(403, 'unauthorized', 'Not signed in.');
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
    $mime = $info['mime'] ?? '';

    $dir = $cfg['upload_dir'];
    if (!is_dir($dir)) @mkdir($dir, 0775, true);
    if (!is_dir($dir) || !is_writable($dir)) {
        cms_fail(500, 'not_writable', "images/uploads is not writable — set it to 775.");
    }

    $stem = strtolower(preg_replace('/[^a-z0-9]+/i', '-', pathinfo($f['name'], PATHINFO_FILENAME)) ?: 'image');
    $stem = trim($stem, '-') ?: 'image';
    $stem .= '-' . substr(bin2hex(random_bytes(5)), 0, 8);

    $src = null;
    if (function_exists('imagecreatefromstring')) {
        $src = @imagecreatefromstring((string) file_get_contents($f['tmp_name']));
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
    $ext = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'][$mime] ?? 'img';
    $relFull = $cfg['upload_url'] . '/' . $stem . '.' . $ext;
    if (!move_uploaded_file($f['tmp_name'], $dir . '/' . $stem . '.' . $ext)) {
        cms_fail(500, 'move_failed', 'Could not store the uploaded file.');
    }
    cms_ok(['path' => $relFull, 'widths' => [], 'variants' => false,
            'note' => 'Server has no GD/WebP support — stored full-size only, no responsive variants.']);
}
