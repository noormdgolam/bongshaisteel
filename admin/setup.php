<?php
/* ==========================================================================
   ONE-TIME SETUP — generate the password hash and write admin/config.php.
   Stops working once a real hash exists. Delete this file afterwards.
   ========================================================================== */
require __DIR__ . '/lib.php';

$cfgPath    = __DIR__ . '/config.php';
$samplePath = __DIR__ . '/config.sample.php';
$raw        = cms_config_raw();

if (cms_config_ready($raw)) {
    http_response_code(410);
    exit('Setup already complete. Please delete admin/setup.php.');
}

$msg = '';
$hash = '';
$wrote = false;

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $pw  = (string) ($_POST['password'] ?? '');
    $pw2 = (string) ($_POST['password2'] ?? '');
    if (strlen($pw) < 6) {
        $msg = 'Use at least 6 characters.';
    } elseif ($pw !== $pw2) {
        $msg = 'The two passwords do not match.';
    } else {
        $hash = password_hash($pw, PASSWORD_DEFAULT);

        // Build config.php from the sample (or from scratch) with the hash filled in.
        $tpl = is_file($samplePath) ? (string) file_get_contents($samplePath) : '';
        if ($tpl !== '' && strpos($tpl, 'REPLACE_WITH_HASH') !== false) {
            $out = str_replace('REPLACE_WITH_HASH', addslashes($hash), $tpl);
        } else {
            $out = "<?php\nreturn " . var_export([
                'password_hash' => $hash,
                'content_file'  => dirname(__DIR__) . '/data/content.json',
                'default_file'  => dirname(__DIR__) . '/data/content.default.json',
                'backup_dir'    => __DIR__ . '/backups',
                'keep_backups'  => 15,
                'upload_dir'    => dirname(__DIR__) . '/images/uploads',
                'upload_url'    => 'images/uploads',
                'max_upload'    => 8 * 1024 * 1024,
                'session_name'  => 'bs_cms',
            ], true) . ";\n";
        }

        if (@file_put_contents($cfgPath, $out) !== false) {
            $wrote = true;
            $msg = 'config.php written. You can sign in now — then DELETE admin/setup.php.';
        } else {
            $msg = 'Could not write admin/config.php (folder not writable). '
                 . 'Create it manually with the hash shown below.';
        }
    }
}
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>CMS Setup · Bongshai Steel</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px;
         font: 15px/1.6 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #0f172a; color: #e2e8f0; }
  .card { width: 100%; max-width: 460px; background: #1e293b; border: 1px solid #334155;
          border-radius: 14px; padding: 30px; }
  h1 { margin: 0 0 16px; font-size: 1.2rem; }
  label { display: block; font-weight: 600; font-size: .82rem; margin: 14px 0 6px; }
  input { width: 100%; padding: 11px 13px; border-radius: 9px; border: 1px solid #475569;
          background: #0f172a; color: #f1f5f9; font-size: 1rem; box-sizing: border-box; }
  button { width: 100%; margin-top: 18px; padding: 12px; border: 0; border-radius: 9px; cursor: pointer;
           background: #0466c8; color: #fff; font-weight: 700; font-size: 1rem; }
  .msg { margin-top: 16px; padding: 12px; border-radius: 9px; background: #0b3b5c; font-size: .88rem; }
  code { background: #0f172a; padding: 2px 6px; border-radius: 5px; font-size: .82rem; word-break: break-all; }
  a { color: #7dd3fc; }
</style>
</head>
<body>
  <form class="card" method="post" autocomplete="off">
    <h1>Set the CMS password</h1>
    <p>Pick a password for the content editor. This writes <code>admin/config.php</code>.</p>
    <label for="p1">Password</label>
    <input id="p1" name="password" type="password" required autofocus>
    <label for="p2">Repeat password</label>
    <input id="p2" name="password2" type="password" required>
    <button type="submit">Save</button>
<?php if ($msg): ?>
    <div class="msg">
      <?= htmlspecialchars($msg) ?>
      <?php if ($hash && !$wrote): ?>
        <br><br>Hash:<br><code><?= htmlspecialchars($hash) ?></code>
      <?php endif; ?>
      <?php if ($wrote): ?>
        <br><br><a href="login.php">Go to sign in →</a>
      <?php endif; ?>
    </div>
<?php endif; ?>
  </form>
</body>
</html>
