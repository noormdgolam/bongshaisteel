<?php
/* ==========================================================================
   BONGSHAI STEEL — CMS API
   GET  ?action=load     auth     { content, authed }
   GET  ?action=whoami   public   { authed }
   POST ?action=save     auth     body { content:{...} }  -> { content }
   POST ?action=upload   auth     multipart file          -> { path, widths }
   GET  ?action=backups  auth     { backups:[{id,when,size}] }
   POST ?action=restore  auth     body { id }               -> { content }
   POST ?action=logout   -        { ok }
   ========================================================================== */
require __DIR__ . '/lib.php';

header('Cache-Control: no-store');
cms_security_headers();

$action = $_GET['action'] ?? '';
$isPost = ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST';

// Second lock on the SameSite=Lax session cookie.
if ($isPost) cms_require_same_origin();

switch ($action) {
    case 'load':
        // Admin-only: the public page reads data/content.json directly.
        cms_require_auth();
        cms_ok(['content' => cms_read_content(), 'authed' => true]);
        break;

    case 'whoami':
        cms_ok(['authed' => cms_is_authed()]);
        break;

    case 'save':
        cms_require_auth();
        if (!$isPost) cms_fail(405, 'method', 'POST required.');
        $limit = (int) (cms_config()['max_body'] ?? 4194304);
        $raw   = (string) file_get_contents('php://input');
        if (strlen($raw) > $limit) {
            cms_fail(413, 'body_too_big', 'That payload is over the ' . round($limit / 1048576) . ' MB save limit.');
        }
        $body = json_decode($raw, true, 64);
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

    case 'backups':
        cms_require_auth();
        cms_ok(['backups' => cms_backups_list()]);
        break;

    case 'restore':
        cms_require_auth();
        if (!$isPost) cms_fail(405, 'method', 'POST required.');
        $body = json_decode((string) file_get_contents('php://input'), true);
        $id   = is_array($body) ? (string) ($body['id'] ?? '') : '';
        cms_ok(['content' => cms_restore_backup($id)]);
        break;

    case 'logout':
        cms_session_destroy();
        cms_ok();
        break;

    default:
        cms_fail(404, 'unknown_action', "Unknown action '" . htmlspecialchars((string) $action) . "'.");
}
