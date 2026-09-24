<?php
/* ==========================================================================
   BONGSHAI STEEL — PUBLIC LEAD INTAKE
   --------------------------------------------------------------------------
   The one endpoint on this site that an anonymous visitor may write to, so
   everything here is about keeping that narrow: fixed field list, hard length
   caps, a honeypot, and a per-IP rate limit.

   POST (form-encoded or JSON)
     kind       "quote" | "contact"
     name, phone, ...  see CMS_LEAD_FIELDS
     website    honeypot - must stay empty
   ->  { ok: true }                      on success
       { ok: false, error, message }     otherwise
   ========================================================================== */
declare(strict_types=1);
require __DIR__ . '/admin/lib.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    cms_fail(405, 'method', 'POST required.');
}

/* Read either an HTML form post or a JSON body. */
$ctype = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));
if (strpos($ctype, 'application/json') !== false) {
    $raw = (string) file_get_contents('php://input');
    if (strlen($raw) > 16384) cms_fail(413, 'too_big', 'That message is too long.');
    $in = json_decode($raw, true);
    if (!is_array($in)) cms_fail(400, 'bad_body', 'Expected a JSON object.');
} else {
    $in = $_POST;
}

/* Honeypot: a real person never sees this field, so anything in it is a bot. */
if (trim((string) ($in['website'] ?? '')) !== '') {
    // Answer as though it worked; there is nothing to gain by telling it apart.
    cms_ok(['stored' => false]);
}

$cfg = cms_config();

/* Rate limit before doing any work. */
$left = cms_lead_rate_left();
if ($left > 0) {
    cms_fail(429, 'too_many', 'Too many messages from this connection. Try again in '
        . (int) ceil($left / 60) . ' min, or call the hotline.');
}

$kind = ($in['kind'] ?? '') === 'quote' ? 'quote' : 'contact';

$fields = [];
foreach (CMS_LEAD_FIELDS as $name => $max) {
    $v = trim((string) ($in[$name] ?? ''));
    if ($v === '') continue;
    if (function_exists('mb_substr')) $v = mb_substr($v, 0, $max);
    else $v = substr($v, 0, $max);
    // Strip control characters; these end up in a CSV and in the dashboard.
    $fields[$name] = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $v);
}

if (($fields['name'] ?? '') === '' || ($fields['phone'] ?? '') === '') {
    cms_fail(422, 'missing', 'Please give a name and a phone number.');
}

$lead = [
    'id'     => gmdate('Ymd-His') . '-' . bin2hex(random_bytes(3)),
    'at'     => gmdate('c'),
    'kind'   => $kind,
    'status' => 'new',
    'note'   => '',
    'fields' => $fields,
    // Enough to spot one abusive source, not enough to identify a person.
    'from'   => substr(hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . ($cfg['password_hash'] ?? '')), 0, 12),
    'agent'  => substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 200),
];

cms_leads_append($lead);
cms_lead_rate_note();
cms_activity('lead.new', $kind . ' from ' . ($fields['name'] ?? '?'));

cms_ok(['stored' => true]);
