<?php
require __DIR__ . '/lib.php';
cms_security_headers(true);

$cfg     = cms_config_raw();
$ready   = cms_config_ready($cfg);
$err     = '';
$locked  = 0;
// same-origin path only — reject protocol-relative (//host) and backslash tricks
$return = './';
if (isset($_GET['return']) && is_string($_GET['return'])
    && preg_match('#^/[A-Za-z0-9/_.?=&%~-]*$#', $_GET['return'])
    && strpos($_GET['return'], '//') !== 0
    && strpos($_GET['return'], '/\\') !== 0) {
    $return = $_GET['return'];
}

if ($ready) {
    cms_session_start();
    if (!empty($_SESSION['cms_ok'])) { header('Location: ' . $return); exit; }

    $locked = cms_throttle_locked();

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
        if ($locked > 0) {
            $err = 'Too many failed attempts. Try again in ' . (int) ceil($locked / 60) . ' min.';
        } elseif (!cms_same_origin()) {
            $err = 'That sign-in did not come from this site. Reload the page and try again.';
        } else {
            $user = trim((string) ($_POST['username'] ?? ''));
            $pw   = (string) ($_POST['password'] ?? '');
            $want = (string) ($cfg['username'] ?? cms_config_defaults()['username']);

            // Both halves are always evaluated, so a wrong name and a wrong
            // password take the same time and the error never says which.
            $userOk = hash_equals(strtolower($want), strtolower($user));
            $pwOk   = $pw !== '' && password_verify($pw, $cfg['password_hash']);

            if ($userOk && $pwOk) {
                cms_throttle_note(false);
                cms_session_open();
                cms_activity('auth.signin');
                header('Location: ' . $return);
                exit;
            }
            cms_throttle_note(true);
            cms_activity('auth.failed');
            usleep(700000);
            $locked = cms_throttle_locked();
            $err = $locked > 0
                ? 'Too many failed attempts. Try again in ' . (int) ceil($locked / 60) . ' min.'
                : 'Incorrect username or password.';
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
<title>Sign in · Bongshai Steel CMS</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
         font: 15px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
         background: #0f172a; color: #e2e8f0; padding: 24px; }
  .card { width: 100%; max-width: 360px; background: #1e293b; border: 1px solid #334155;
          border-radius: 14px; padding: 30px; box-shadow: 0 20px 50px rgba(0,0,0,.4); }
  h1 { margin: 0 0 4px; font-size: 1.25rem; }
  p.sub { margin: 0 0 22px; color: #94a3b8; font-size: .88rem; }
  label { display: block; font-weight: 600; font-size: .82rem; margin-bottom: 6px; color: #cbd5e1; }
  input[type=password], input[type=text] { width: 100%; padding: 12px 14px; border-radius: 9px;
          border: 1px solid #475569; background: #0f172a; color: #f1f5f9; font-size: 1rem; }
  input:focus { outline: 2px solid #38bdf8; outline-offset: 1px; }
  label + input { margin-bottom: 4px; }
  button { width: 100%; margin-top: 16px; padding: 12px; border: 0; border-radius: 9px; cursor: pointer;
          background: #0466c8; color: #fff; font-size: 1rem; font-weight: 700; }
  button:hover { background: #0355a6; }
  .err { margin-top: 14px; color: #fca5a5; font-size: .86rem; }
  .warn { margin-top: 14px; padding: 12px; border-radius: 9px; background: #422006; color: #fed7aa;
          font-size: .84rem; border: 1px solid #9a3412; }
  a { color: #7dd3fc; }
</style>
</head>
<body>
  <form class="card" method="post" autocomplete="off">
    <h1>Bongshai Steel CMS</h1>
    <p class="sub">Content editor — sign in to continue.</p>
<?php if (!$ready): ?>
    <div class="warn">
      Setup isn't finished. Copy <code>admin/config.sample.php</code> to
      <code>admin/config.php</code>, then open <a href="setup.php">admin/setup.php</a>
      to set a password.
    </div>
<?php else: ?>
    <label for="user">Username</label>
    <input id="user" name="username" type="text" autocomplete="username" required autofocus<?= $locked > 0 ? ' disabled' : '' ?>>
    <label for="pw">Password</label>
    <input id="pw" name="password" type="password" autocomplete="current-password" required<?= $locked > 0 ? ' disabled' : '' ?>>
    <button type="submit"<?= $locked > 0 ? ' disabled' : '' ?>>Sign in</button>
    <?php if ($err): ?><div class="err"><?= htmlspecialchars($err) ?></div><?php endif; ?>
<?php endif; ?>
  </form>
</body>
</html>
