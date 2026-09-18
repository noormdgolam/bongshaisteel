<?php
/* ==========================================================================
   BONGSHAI STEEL — CMS API
   GET  ?action=load     public   { content, authed }
   GET  ?action=whoami   public   { authed }
   POST ?action=save     auth     body { content:{...} }  -> { content }
   POST ?action=upload   auth     multipart file          -> { path, widths }
   POST ?action=logout   -        { ok }
   ========================================================================== */
require __DIR__ . '/lib.php';

header('Cache-Control: no-store');

$action = $_GET['action'] ?? '';
$isPost = ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST';

switch ($action) {
    case 'load':
        cms_ok(['content' => cms_read_content(), 'authed' => cms_is_authed()]);
        break;

    case 'whoami':
        cms_ok(['authed' => cms_is_authed()]);
        break;

    case 'save':
        cms_require_auth();
        if (!$isPost) cms_fail(405, 'method', 'POST required.');
        $body = json_decode((string) file_get_contents('php://input'), true);
        if (!is_array($body) || !isset($body['content']) || !is_array($body['content'])) {
            cms_fail(400, 'bad_body', 'Expected JSON: { "content": { ... } }');
        }
        cms_ok(['content' => cms_write_content($body['content'])]);
        break;

    case 'upload':
        cms_require_auth();
        if (!$isPost) cms_fail(405, 'method', 'POST required.');
        cms_handle_upload();
        break;

    case 'logout':
        cms_session_start();
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
        }
        session_destroy();
        cms_ok();
        break;

    default:
        cms_fail(404, 'unknown_action', "Unknown action '" . htmlspecialchars((string) $action) . "'.");
}
