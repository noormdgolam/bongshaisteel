<?php
/* ==========================================================================
   BONGSHAI STEEL — CMS API
   GET  ?action=load     auth     { content, authed }
   GET  ?action=whoami   public   { authed }
   POST ?action=save     auth     body { content:{...} }  -> { content }
   POST ?action=upload   auth     multipart file          -> { path, widths }
   GET  ?action=backups  auth     { backups:[{id,when,size}] }
   POST ?action=restore  auth     body { id }               -> { content }
   GET  ?action=stats    auth     { stats:{...} }
   GET  ?action=activity auth     { activity:[{at,event,detail}] }
   GET  ?action=leads    auth     { leads:[...], statuses:[...] }
   GET  ?action=leads-csv auth    text/csv download
   POST ?action=lead-update auth  body { id, status?, note? } -> { lead }
   POST ?action=lead-delete auth  body { id }                 -> { removed }
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
        $saved = cms_write_content($body['content']);
        cms_activity('content.save', 'products: ' . (is_array($saved['products'] ?? null) ? count($saved['products']) : 0));
        cms_ok(['content' => $saved]);
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
        $restored = cms_restore_backup($id);
        cms_activity('content.restore', $id);
        cms_ok(['content' => $restored]);
        break;

    case 'stats':
        cms_require_auth();
        cms_ok(['stats' => cms_stats()]);
        break;

    case 'activity':
        cms_require_auth();
        cms_ok(['activity' => cms_activity_read(200)]);
        break;

    case 'leads':
        cms_require_auth();
        cms_ok(['leads' => cms_leads_read(), 'statuses' => CMS_LEAD_STATUSES]);
        break;

    case 'leads-csv':
        cms_require_auth();
        $cols = array_keys(CMS_LEAD_FIELDS);
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="bongshai-leads-' . gmdate('Ymd') . '.csv"');
        $out = fopen('php://output', 'w');
        fwrite($out, "\xEF\xBB\xBF");           // BOM, so Excel reads the Bangla
        fputcsv($out, array_merge(['id', 'received', 'kind', 'status', 'note'], $cols));
        foreach (cms_leads_read() as $l) {
            $row = [$l['id'] ?? '', $l['at'] ?? '', $l['kind'] ?? '', $l['status'] ?? '', $l['note'] ?? ''];
            foreach ($cols as $c) $row[] = $l['fields'][$c] ?? '';
            fputcsv($out, $row);
        }
        fclose($out);
        exit;

    case 'lead-update':
        cms_require_auth();
        if (!$isPost) cms_fail(405, 'method', 'POST required.');
        $body = json_decode((string) file_get_contents('php://input'), true);
        if (!is_array($body) || ($body['id'] ?? '') === '') cms_fail(400, 'bad_body', 'Expected { id }.');

        $leads = cms_leads_read();
        $hit   = null;
        foreach ($leads as $i => $l) {
            if (($l['id'] ?? '') !== $body['id']) continue;
            if (isset($body['status'])) {
                if (!in_array($body['status'], CMS_LEAD_STATUSES, true)) {
                    cms_fail(422, 'bad_status', 'Unknown status.');
                }
                $leads[$i]['status'] = $body['status'];
            }
            if (isset($body['note'])) {
                $leads[$i]['note'] = mb_substr((string) $body['note'], 0, 2000);
            }
            $hit = $leads[$i];
            break;
        }
        if ($hit === null) cms_fail(404, 'no_lead', 'That message is no longer there.');
        cms_leads_write($leads);
        cms_activity('lead.update', ($hit['id'] ?? '') . ' -> ' . ($hit['status'] ?? ''));
        cms_ok(['lead' => $hit]);
        break;

    case 'lead-delete':
        cms_require_auth();
        if (!$isPost) cms_fail(405, 'method', 'POST required.');
        $body = json_decode((string) file_get_contents('php://input'), true);
        if (!is_array($body) || ($body['id'] ?? '') === '') cms_fail(400, 'bad_body', 'Expected { id }.');

        $leads = cms_leads_read();
        $kept  = array_values(array_filter($leads, fn($l) => ($l['id'] ?? '') !== $body['id']));
        if (count($kept) === count($leads)) cms_fail(404, 'no_lead', 'That message is no longer there.');
        cms_leads_write($kept);
        cms_activity('lead.delete', (string) $body['id']);
        cms_ok(['removed' => true]);
        break;

    case 'logout':
        cms_activity('auth.logout');
        cms_session_destroy();
        cms_ok();
        break;

    default:
        cms_fail(404, 'unknown_action', "Unknown action '" . htmlspecialchars((string) $action) . "'.");
}
