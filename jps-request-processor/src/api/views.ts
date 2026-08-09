import type { Client } from '../types/client.ts';
import type { ChangeRequest } from '../types/change-request.ts';
import type { MessageBatch } from '../types/message.ts';
import { REQUEST_STATUSES } from '../types/change-request.ts';
import { escapeHtml } from '../utils/html.ts';

/**
 * Server-rendered HTML for the internal dashboard. No build step, no client
 * framework, no external requests — the page is the whole front end.
 *
 * Everything client-supplied is escaped on the way in: message text and client
 * names arrive from Facebook and are not trusted.
 */

const STYLES = `
:root {
  --bg: #f6f6f4; --panel: #fff; --ink: #1c1c1a; --muted: #6b6b66;
  --line: #e2e2dd; --accent: #1f5f4f; --warn: #9a6200; --danger: #a03028;
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
header {
  background: var(--panel); border-bottom: 1px solid var(--line);
  padding: 14px 20px; display: flex; gap: 20px; align-items: baseline; flex-wrap: wrap;
}
header .brand { font-weight: 650; letter-spacing: -0.01em; }
header nav a { color: var(--muted); text-decoration: none; margin-right: 14px; }
header nav a:hover, header nav a.active { color: var(--accent); }
main { max-width: 980px; margin: 0 auto; padding: 24px 20px 60px; }
h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.02em; }
h2 { font-size: 15px; margin: 26px 0 8px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
a { color: var(--accent); }
.card {
  background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
  padding: 16px 18px; margin-bottom: 12px;
}
.card-link { display: block; text-decoration: none; color: inherit; }
.card-link:hover { border-color: var(--accent); }
.row { display: flex; justify-content: space-between; gap: 16px; align-items: baseline; flex-wrap: wrap; }
.muted { color: var(--muted); font-size: 13px; }
.tag {
  display: inline-block; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase;
  border: 1px solid var(--line); border-radius: 999px; padding: 2px 9px; color: var(--muted);
}
.tag.change { border-color: var(--accent); color: var(--accent); }
.tag.possible { border-color: var(--warn); color: var(--warn); }
.tag.unknown { border-color: var(--danger); color: var(--danger); }
.filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.filters a {
  text-decoration: none; font-size: 13px; padding: 4px 11px; border: 1px solid var(--line);
  border-radius: 999px; background: var(--panel); color: var(--muted);
}
.filters a.active { border-color: var(--accent); color: var(--accent); }
ul.plain { margin: 6px 0; padding-left: 20px; }
ul.plain li { margin-bottom: 4px; }
blockquote {
  margin: 8px 0; padding: 8px 12px; border-left: 3px solid var(--line);
  color: var(--muted); white-space: pre-wrap;
}
textarea, input[type=text], input[type=url] {
  width: 100%; font: inherit; padding: 9px 11px; border: 1px solid var(--line);
  border-radius: 8px; background: #fcfcfb; color: var(--ink);
}
textarea { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; line-height: 1.5; }
label { display: block; margin: 14px 0 4px; font-size: 13px; color: var(--muted); }
button, .button {
  font: inherit; font-size: 14px; padding: 7px 14px; border-radius: 8px; cursor: pointer;
  border: 1px solid var(--line); background: var(--panel); color: var(--ink); text-decoration: none;
}
button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
button:hover { border-color: var(--accent); }
.actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; align-items: center; }
form.inline { display: inline; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
.empty { color: var(--muted); padding: 30px 0; text-align: center; }
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #16171a; --panel: #1e2024; --ink: #e9e9e4; --muted: #9a9a94;
    --line: #303339; --accent: #6cc3a5; --warn: #d9a441; --danger: #e0796e;
  }
  textarea, input { background: #191b1e; }
}
`;

function nav(active: string): string {
  const items = [
    ['/dashboard', 'Requests'],
    ['/dashboard/clients', 'Clients'],
    ['/dashboard/failed', 'Failed batches'],
  ];
  return items
    .map(
      ([href, label]) =>
        `<a href="${href}" class="${href === active ? 'active' : ''}">${escapeHtml(label)}</a>`,
    )
    .join('');
}

export function layout(title: string, body: string, activeNav = '/dashboard'): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)} · JPS Requests</title>
<style>${STYLES}</style>
</head>
<body>
<header>
  <span class="brand">JPS Request Processor</span>
  <nav>${nav(activeNav)}</nav>
</header>
<main>${body}</main>
</body>
</html>`;
}

function classificationTag(request: ChangeRequest): string {
  const map: Record<string, [string, string]> = {
    CHANGE_REQUEST: ['change', 'Change request'],
    POSSIBLE_CHANGE: ['possible', 'Possible change'],
    UNKNOWN_CLIENT: ['unknown', 'Unknown sender'],
    OTHER: ['', 'No change requested'],
  };
  const [cls, label] = map[request.classification] ?? ['', request.classification];
  return `<span class="tag ${cls}">${escapeHtml(label)}</span>`;
}

function when(iso: string): string {
  return escapeHtml(iso.replace('T', ' ').slice(0, 16));
}

function hiddenToken(token: string): string {
  return `<input type="hidden" name="token" value="${escapeHtml(token)}">`;
}

export function requestsPage(
  requests: ChangeRequest[],
  clientsById: Map<string, Client>,
  counts: Record<string, number>,
  activeStatus: string | null,
): string {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

  const filters = [
    `<a href="/dashboard" class="${activeStatus ? '' : 'active'}">All (${total})</a>`,
    ...REQUEST_STATUSES.map(
      (status) =>
        `<a href="/dashboard?status=${status}" class="${activeStatus === status ? 'active' : ''}">${escapeHtml(
          status.replace('_', ' ').toLowerCase(),
        )} (${counts[status] ?? 0})</a>`,
    ),
  ].join('');

  const cards = requests
    .map((request) => {
      const client = request.client_id ? clientsById.get(request.client_id) : undefined;
      return `<a class="card card-link" href="/dashboard/requests/${escapeHtml(request.id)}">
  <div class="row">
    <strong>${escapeHtml(client?.business_name ?? 'Unknown sender')}</strong>
    <span class="muted">${when(request.created_at)}</span>
  </div>
  <p style="margin:8px 0 10px">${escapeHtml(request.summary)}</p>
  <div class="row">
    <span>${classificationTag(request)} <span class="tag">${escapeHtml(request.status.replace('_', ' '))}</span></span>
    <span class="muted">${Math.round(request.confidence * 100)}% confidence${
      request.lovable_prompt ? ' · prompt ready' : ''
    }</span>
  </div>
</a>`;
    })
    .join('');

  return layout(
    'Requests',
    `<h1>Requests</h1>
<p class="muted">Every processed message batch, newest first. Nothing here has been applied to a website.</p>
<div class="filters">${filters}</div>
${cards || '<p class="empty">No requests yet.</p>'}`,
  );
}

export function requestDetailPage(
  request: ChangeRequest,
  client: Client | null,
  clients: Client[],
  token: string,
  senderId: string | null,
): string {
  const messages = request.original_messages
    .map((message) => {
      const attachments = message.attachments
        .map((attachment) => `<span class="tag">${escapeHtml(attachment.type)}</span>`)
        .join(' ');
      const url = message.attachments
        .filter((attachment) => attachment.url)
        .map(
          (attachment) =>
            `<div class="muted"><a href="${escapeHtml(attachment.url ?? '')}" rel="noreferrer noopener" target="_blank">open attachment</a></div>`,
        )
        .join('');
      return `<blockquote>${escapeHtml(message.text || '(no text)')}
<div class="muted" style="margin-top:6px">${when(message.sent_at)} ${attachments}</div>${url}</blockquote>`;
    })
    .join('');

  const changes = request.requested_changes
    .map(
      (change) =>
        `<li>${escapeHtml(change.description)}${
          change.page ? ` <span class="muted">— ${escapeHtml(change.page)}</span>` : ''
        }</li>`,
    )
    .join('');

  const supplied = request.client_supplied_content
    .map(
      (item) =>
        `<li><code>${escapeHtml(item.value)}</code> <span class="muted">— ${escapeHtml(item.usage)}</span></li>`,
    )
    .join('');

  const attachments = request.attachments_required
    .map(
      (item) =>
        `<li>${escapeHtml(item.purpose)} <span class="muted">— ${
          item.supplied ? 'supplied by the client' : 'not supplied yet'
        }</span></li>`,
    )
    .join('');

  const ambiguities = request.ambiguities
    .map((item) => `<li><strong>${escapeHtml(item.question)}</strong><br><span class="muted">${escapeHtml(item.why)}</span></li>`)
    .join('');

  const statusButtons = REQUEST_STATUSES.filter((status) => status !== request.status)
    .map(
      (status) =>
        `<form class="inline" method="post" action="/dashboard/requests/${escapeHtml(request.id)}/status">
  ${hiddenToken(token)}<input type="hidden" name="status" value="${status}">
  <button type="submit">Mark ${escapeHtml(status.replace('_', ' ').toLowerCase())}</button>
</form>`,
    )
    .join(' ');

  const linkForm =
    request.classification === 'UNKNOWN_CLIENT'
      ? `<h2>Link this sender to a client</h2>
<div class="card">
  <p class="muted">Facebook sender id <code>${escapeHtml(senderId ?? 'unknown')}</code> is not linked to a
  client. Pick the client below — the sender id is saved against them and this batch is reprocessed with
  their site context.</p>
  <form method="post" action="/dashboard/requests/${escapeHtml(request.id)}/link">
    ${hiddenToken(token)}
    <label for="client_id">Client</label>
    <select id="client_id" name="client_id" style="width:100%;padding:9px;border-radius:8px">
      ${clients
        .map((option) => `<option value="${escapeHtml(option.id)}">${escapeHtml(option.business_name)}</option>`)
        .join('')}
    </select>
    <div class="actions"><button class="primary" type="submit">Link and reprocess</button></div>
  </form>
</div>`
      : '';

  const promptBlock = request.lovable_prompt
    ? `<h2>Lovable prompt</h2>
<div class="card">
  <textarea id="prompt" rows="22" readonly>${escapeHtml(request.lovable_prompt)}</textarea>
  <div class="actions">
    <button class="primary" type="button" onclick="copyPrompt()">Copy prompt</button>
    <span class="muted" id="copy-status"></span>
  </div>
  <p class="muted">Read it before you paste it. Nothing is applied to the site until you run it in Lovable.</p>
</div>
<script>
function copyPrompt() {
  const field = document.getElementById('prompt');
  const status = document.getElementById('copy-status');
  field.select();
  navigator.clipboard.writeText(field.value).then(
    () => { status.textContent = 'Copied.'; },
    () => { status.textContent = 'Press Ctrl/Cmd+C to copy.'; }
  );
}
</script>`
    : '';

  return layout(
    request.summary.slice(0, 60),
    `<p class="muted"><a href="/dashboard">← All requests</a></p>
<h1>${escapeHtml(client?.business_name ?? 'Unknown sender')}</h1>
<div class="row">
  <span>${classificationTag(request)} <span class="tag">${escapeHtml(request.status.replace('_', ' '))}</span></span>
  <span class="muted">${when(request.created_at)} · ${Math.round(request.confidence * 100)}% confidence</span>
</div>

<h2>What the AI understood</h2>
<div class="card">
  <p>${escapeHtml(request.summary)}</p>
  ${changes ? `<ul class="plain">${changes}</ul>` : ''}
  ${supplied ? `<h2>Client-supplied values</h2><ul class="plain">${supplied}</ul>` : ''}
  ${attachments ? `<h2>Files</h2><ul class="plain">${attachments}</ul>` : ''}
  ${ambiguities ? `<h2>Needs clarification</h2><ul class="plain">${ambiguities}</ul>` : ''}
  ${
    request.clarification_required
      ? `<p class="muted">${escapeHtml(request.clarification_required)}</p>`
      : ''
  }
</div>

<h2>Original messages</h2>
${messages || '<p class="muted">(none)</p>'}

${linkForm}
${promptBlock}

<h2>Status</h2>
<div class="actions">${statusButtons}</div>`,
    '/dashboard',
  );
}

export function clientsPage(clients: Client[]): string {
  const rows = clients
    .map(
      (client) => `<tr>
  <td><a href="/dashboard/clients/${escapeHtml(client.id)}">${escapeHtml(client.business_name)}</a></td>
  <td class="muted">${escapeHtml(client.facebook_sender_id)}</td>
  <td class="muted">${escapeHtml(client.website_url ?? '—')}</td>
  <td class="muted">${client.active ? 'active' : 'inactive'}</td>
</tr>`,
    )
    .join('');

  return layout(
    'Clients',
    `<h1>Clients</h1>
<p class="muted">A message is only interpreted when its Facebook sender id matches a client here.</p>
<div class="actions" style="margin-bottom:16px">
  <a class="button" href="/dashboard/clients/new">Add client</a>
</div>
<div class="card">
  <table>
    <tr><th>Business</th><th>Facebook sender id</th><th>Website</th><th>State</th></tr>
    ${rows || '<tr><td colspan="4" class="empty">No clients yet.</td></tr>'}
  </table>
</div>`,
    '/dashboard/clients',
  );
}

export function clientFormPage(client: Client | null, token: string, error?: string): string {
  const action = client ? `/dashboard/clients/${escapeHtml(client.id)}` : '/dashboard/clients';
  const value = (field: keyof Client): string => escapeHtml((client?.[field] as string) ?? '');

  return layout(
    client ? client.business_name : 'Add client',
    `<p class="muted"><a href="/dashboard/clients">← Clients</a></p>
<h1>${client ? escapeHtml(client.business_name) : 'Add client'}</h1>
${error ? `<div class="card" style="border-color:var(--danger)">${escapeHtml(error)}</div>` : ''}
<form method="post" action="${action}">
  ${hiddenToken(token)}
  <div class="card">
    <label for="business_name">Business name</label>
    <input id="business_name" type="text" name="business_name" value="${value('business_name')}" required>

    <label for="facebook_sender_id">Facebook sender id</label>
    <input id="facebook_sender_id" type="text" name="facebook_sender_id" value="${value('facebook_sender_id')}" required>
    <p class="muted">The page-scoped id of the person who messages the Page. Take it from the
    <code>client_unknown</code> log line or the unknown-sender request.</p>

    <label for="website_url">Website URL</label>
    <input id="website_url" type="url" name="website_url" value="${value('website_url')}">

    <label for="lovable_project_reference">Lovable project reference</label>
    <input id="lovable_project_reference" type="text" name="lovable_project_reference" value="${value(
      'lovable_project_reference',
    )}">

    <label for="site_context">Site context</label>
    <textarea id="site_context" name="site_context" rows="12" placeholder="Pages, layout conventions, and anything that must be preserved.">${value(
      'site_context',
    )}</textarea>

    <label for="special_instructions">Standing instructions</label>
    <textarea id="special_instructions" name="special_instructions" rows="5">${value(
      'special_instructions',
    )}</textarea>

    <label><input type="checkbox" name="active" value="1" ${
      !client || client.active ? 'checked' : ''
    }> Active</label>

    <div class="actions"><button class="primary" type="submit">Save</button></div>
  </div>
</form>`,
    '/dashboard/clients',
  );
}

export function failedBatchesPage(batches: MessageBatch[], token: string): string {
  const rows = batches
    .map(
      (batch) => `<tr>
  <td class="muted">${when(batch.updated_at)}</td>
  <td class="muted">${escapeHtml(batch.facebook_sender_id)}</td>
  <td class="muted">${batch.attempts}</td>
  <td>${escapeHtml(batch.last_error ?? '')}</td>
  <td>
    <form class="inline" method="post" action="/dashboard/batches/${escapeHtml(batch.id)}/retry">
      ${hiddenToken(token)}<button type="submit">Retry</button>
    </form>
  </td>
</tr>`,
    )
    .join('');

  return layout(
    'Failed batches',
    `<h1>Failed batches</h1>
<p class="muted">Message batches that ran out of retries. The messages are still stored — retrying
re-runs the analysis from scratch.</p>
<div class="card">
  <table>
    <tr><th>Last attempt</th><th>Sender</th><th>Attempts</th><th>Error</th><th></th></tr>
    ${rows || '<tr><td colspan="5" class="empty">Nothing failed. </td></tr>'}
  </table>
</div>`,
    '/dashboard/failed',
  );
}
