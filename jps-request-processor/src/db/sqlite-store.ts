import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { newId } from '../utils/ids.ts';
import type { Store } from './store.ts';
import type { Client, ClientPatch, NewClient } from '../types/client.ts';
import type { Message, MessageBatch, NewMessage } from '../types/message.ts';
import type { ChangeRequest, NewChangeRequest, RequestStatus } from '../types/change-request.ts';

/**
 * SQLite storage, using Node's built-in driver — no native build step and no
 * database server. Good for a single-process deployment with a persistent disk.
 * For hosts with an ephemeral filesystem, use the Supabase driver instead.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  business_name TEXT NOT NULL,
  facebook_sender_id TEXT NOT NULL UNIQUE,
  facebook_page_id TEXT,
  website_url TEXT,
  lovable_project_reference TEXT,
  site_context TEXT,
  special_instructions TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS message_batches (
  id TEXT PRIMARY KEY,
  client_id TEXT,
  facebook_sender_id TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  process_after TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_batches_due ON message_batches (status, process_after);
CREATE INDEX IF NOT EXISTS idx_batches_sender ON message_batches (facebook_sender_id, status);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  mid TEXT NOT NULL UNIQUE,
  batch_id TEXT,
  client_id TEXT,
  facebook_sender_id TEXT NOT NULL,
  facebook_page_id TEXT,
  text TEXT NOT NULL DEFAULT '',
  attachments TEXT NOT NULL DEFAULT '[]',
  sent_at TEXT NOT NULL,
  received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_batch ON messages (batch_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages (facebook_sender_id, sent_at);

CREATE TABLE IF NOT EXISTS change_requests (
  id TEXT PRIMARY KEY,
  client_id TEXT,
  batch_id TEXT NOT NULL,
  classification TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0,
  original_messages TEXT NOT NULL DEFAULT '[]',
  summary TEXT NOT NULL DEFAULT '',
  requested_changes TEXT NOT NULL DEFAULT '[]',
  client_supplied_content TEXT NOT NULL DEFAULT '[]',
  attachments_required TEXT NOT NULL DEFAULT '[]',
  ambiguities TEXT NOT NULL DEFAULT '[]',
  clarification_required TEXT,
  lovable_prompt TEXT,
  status TEXT NOT NULL DEFAULT 'NEW',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- Not unique: reprocessing a batch (after linking an unknown sender) writes a
-- new request and leaves the earlier one as history.
CREATE INDEX IF NOT EXISTS idx_requests_batch ON change_requests (batch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_requests_status ON change_requests (status, created_at);
CREATE INDEX IF NOT EXISTS idx_requests_client ON change_requests (client_id, created_at);

CREATE TABLE IF NOT EXISTS webhook_events (
  event_key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  received_at TEXT NOT NULL
);
`;

type Row = Record<string, unknown>;

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const nullableText = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const num = (value: unknown): number => (typeof value === 'number' ? value : Number(value ?? 0));

function json<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value === '') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toClient(row: Row): Client {
  return {
    id: text(row.id),
    business_name: text(row.business_name),
    facebook_sender_id: text(row.facebook_sender_id),
    facebook_page_id: nullableText(row.facebook_page_id),
    website_url: nullableText(row.website_url),
    lovable_project_reference: nullableText(row.lovable_project_reference),
    site_context: nullableText(row.site_context),
    special_instructions: nullableText(row.special_instructions),
    active: num(row.active) === 1,
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
  };
}

function toMessage(row: Row): Message {
  return {
    id: text(row.id),
    mid: text(row.mid),
    batch_id: nullableText(row.batch_id),
    client_id: nullableText(row.client_id),
    facebook_sender_id: text(row.facebook_sender_id),
    facebook_page_id: nullableText(row.facebook_page_id),
    text: text(row.text),
    attachments: json(row.attachments, []),
    sent_at: text(row.sent_at),
    received_at: text(row.received_at),
  };
}

function toBatch(row: Row): MessageBatch {
  return {
    id: text(row.id),
    client_id: nullableText(row.client_id),
    facebook_sender_id: text(row.facebook_sender_id),
    status: text(row.status) as MessageBatch['status'],
    attempts: num(row.attempts),
    last_error: nullableText(row.last_error),
    process_after: text(row.process_after),
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
  };
}

function toChangeRequest(row: Row): ChangeRequest {
  return {
    id: text(row.id),
    client_id: nullableText(row.client_id),
    batch_id: text(row.batch_id),
    classification: text(row.classification) as ChangeRequest['classification'],
    confidence: num(row.confidence),
    original_messages: json(row.original_messages, []),
    summary: text(row.summary),
    requested_changes: json(row.requested_changes, []),
    client_supplied_content: json(row.client_supplied_content, []),
    attachments_required: json(row.attachments_required, []),
    ambiguities: json(row.ambiguities, []),
    clarification_required: nullableText(row.clarification_required),
    lovable_prompt: nullableText(row.lovable_prompt),
    status: text(row.status) as RequestStatus,
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
  };
}

export function createSqliteStore(path: string): Store {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  const now = () => new Date().toISOString();
  const all = (sql: string, ...params: unknown[]): Row[] =>
    db.prepare(sql).all(...(params as never[])) as unknown as Row[];
  const one = (sql: string, ...params: unknown[]): Row | null => {
    const row = db.prepare(sql).get(...(params as never[])) as unknown as Row | undefined;
    return row ?? null;
  };
  const run = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...(params as never[]));

  return {
    async migrate() {
      db.exec(SCHEMA);
    },

    async close() {
      db.close();
    },

    clients: {
      async getById(id) {
        const row = one('SELECT * FROM clients WHERE id = ?', id);
        return row ? toClient(row) : null;
      },
      async getByFacebookSenderId(senderId) {
        const row = one('SELECT * FROM clients WHERE facebook_sender_id = ? AND active = 1', senderId);
        return row ? toClient(row) : null;
      },
      async list() {
        return all('SELECT * FROM clients ORDER BY business_name').map(toClient);
      },
      async create(input: NewClient) {
        const timestamp = now();
        const client: Client = {
          id: newId(),
          business_name: input.business_name,
          facebook_sender_id: input.facebook_sender_id,
          facebook_page_id: input.facebook_page_id ?? null,
          website_url: input.website_url ?? null,
          lovable_project_reference: input.lovable_project_reference ?? null,
          site_context: input.site_context ?? null,
          special_instructions: input.special_instructions ?? null,
          active: input.active ?? true,
          created_at: timestamp,
          updated_at: timestamp,
        };
        run(
          `INSERT INTO clients (id, business_name, facebook_sender_id, facebook_page_id, website_url,
             lovable_project_reference, site_context, special_instructions, active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          client.id,
          client.business_name,
          client.facebook_sender_id,
          client.facebook_page_id,
          client.website_url,
          client.lovable_project_reference,
          client.site_context,
          client.special_instructions,
          client.active ? 1 : 0,
          client.created_at,
          client.updated_at,
        );
        return client;
      },
      async update(id, patch: ClientPatch) {
        const existing = one('SELECT * FROM clients WHERE id = ?', id);
        if (!existing) return null;
        const current = toClient(existing);
        const merged: Client = {
          ...current,
          business_name: patch.business_name ?? current.business_name,
          facebook_sender_id: patch.facebook_sender_id ?? current.facebook_sender_id,
          facebook_page_id: patch.facebook_page_id !== undefined ? patch.facebook_page_id : current.facebook_page_id,
          website_url: patch.website_url !== undefined ? patch.website_url : current.website_url,
          lovable_project_reference:
            patch.lovable_project_reference !== undefined
              ? patch.lovable_project_reference
              : current.lovable_project_reference,
          site_context: patch.site_context !== undefined ? patch.site_context : current.site_context,
          special_instructions:
            patch.special_instructions !== undefined ? patch.special_instructions : current.special_instructions,
          active: patch.active ?? current.active,
          updated_at: now(),
        };
        run(
          `UPDATE clients SET business_name = ?, facebook_sender_id = ?, facebook_page_id = ?, website_url = ?,
             lovable_project_reference = ?, site_context = ?, special_instructions = ?, active = ?, updated_at = ?
           WHERE id = ?`,
          merged.business_name,
          merged.facebook_sender_id,
          merged.facebook_page_id,
          merged.website_url,
          merged.lovable_project_reference,
          merged.site_context,
          merged.special_instructions,
          merged.active ? 1 : 0,
          merged.updated_at,
          id,
        );
        return merged;
      },
    },

    messages: {
      async insertIfNew(message: NewMessage) {
        const id = newId();
        const result = run(
          `INSERT INTO messages (id, mid, batch_id, client_id, facebook_sender_id, facebook_page_id,
             text, attachments, sent_at, received_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(mid) DO NOTHING`,
          id,
          message.mid,
          message.batch_id,
          message.client_id,
          message.facebook_sender_id,
          message.facebook_page_id,
          message.text,
          JSON.stringify(message.attachments),
          message.sent_at,
          message.received_at,
        );
        if (Number(result.changes) === 0) return null;
        return { ...message, id };
      },
      async listByBatch(batchId) {
        return all('SELECT * FROM messages WHERE batch_id = ? ORDER BY sent_at, id', batchId).map(toMessage);
      },
      async listRecentForSender(senderId, { limit, since }) {
        return all(
          'SELECT * FROM messages WHERE facebook_sender_id = ? AND sent_at >= ? ORDER BY sent_at DESC, id DESC LIMIT ?',
          senderId,
          since,
          limit,
        ).map(toMessage);
      },
      async assignClientForBatch(batchId, clientId) {
        run('UPDATE messages SET client_id = ? WHERE batch_id = ?', clientId, batchId);
      },
    },

    batches: {
      async getById(id) {
        const row = one('SELECT * FROM message_batches WHERE id = ?', id);
        return row ? toBatch(row) : null;
      },
      async findOpenForSender(senderId) {
        const row = one(
          "SELECT * FROM message_batches WHERE facebook_sender_id = ? AND status = 'OPEN' ORDER BY created_at DESC LIMIT 1",
          senderId,
        );
        return row ? toBatch(row) : null;
      },
      async create(input) {
        const timestamp = now();
        const batch: MessageBatch = {
          id: newId(),
          client_id: input.client_id,
          facebook_sender_id: input.facebook_sender_id,
          status: 'OPEN',
          attempts: 0,
          last_error: null,
          process_after: input.process_after,
          created_at: timestamp,
          updated_at: timestamp,
        };
        run(
          `INSERT INTO message_batches (id, client_id, facebook_sender_id, status, attempts, last_error,
             process_after, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          batch.id,
          batch.client_id,
          batch.facebook_sender_id,
          batch.status,
          batch.attempts,
          batch.last_error,
          batch.process_after,
          batch.created_at,
          batch.updated_at,
        );
        return batch;
      },
      async extend(id, processAfter) {
        run(
          "UPDATE message_batches SET process_after = ?, updated_at = ? WHERE id = ? AND status = 'OPEN'",
          processAfter,
          now(),
          id,
        );
      },
      async claimDue(nowIso, limit) {
        const candidates = all(
          "SELECT id FROM message_batches WHERE status = 'OPEN' AND process_after <= ? ORDER BY process_after LIMIT ?",
          nowIso,
          limit,
        );
        const claimed: MessageBatch[] = [];
        for (const candidate of candidates) {
          const result = run(
            "UPDATE message_batches SET status = 'PROCESSING', updated_at = ? WHERE id = ? AND status = 'OPEN'",
            now(),
            candidate.id,
          );
          if (Number(result.changes) === 1) {
            const row = one('SELECT * FROM message_batches WHERE id = ?', candidate.id);
            if (row) claimed.push(toBatch(row));
          }
        }
        return claimed;
      },
      async markDone(id) {
        run("UPDATE message_batches SET status = 'DONE', last_error = NULL, updated_at = ? WHERE id = ?", now(), id);
      },
      async markFailed(id, error, retryAt) {
        if (retryAt) {
          run(
            `UPDATE message_batches SET status = 'OPEN', attempts = attempts + 1, last_error = ?,
               process_after = ?, updated_at = ? WHERE id = ?`,
            error,
            retryAt,
            now(),
            id,
          );
        } else {
          run(
            `UPDATE message_batches SET status = 'FAILED', attempts = attempts + 1, last_error = ?, updated_at = ?
             WHERE id = ?`,
            error,
            now(),
            id,
          );
        }
      },
      async reclaimStuck(claimedBefore, processAfter) {
        const result = run(
          `UPDATE message_batches SET status = 'OPEN', process_after = ?, updated_at = ?
           WHERE status = 'PROCESSING' AND updated_at < ?`,
          processAfter,
          now(),
          claimedBefore,
        );
        return Number(result.changes);
      },
      async listFailed(limit) {
        return all(
          "SELECT * FROM message_batches WHERE status = 'FAILED' ORDER BY updated_at DESC LIMIT ?",
          limit,
        ).map(toBatch);
      },
      async requeue(id, processAfter) {
        run(
          "UPDATE message_batches SET status = 'OPEN', attempts = 0, process_after = ?, updated_at = ? WHERE id = ?",
          processAfter,
          now(),
          id,
        );
        const row = one('SELECT * FROM message_batches WHERE id = ?', id);
        return row ? toBatch(row) : null;
      },
      async setClient(id, clientId) {
        run('UPDATE message_batches SET client_id = ?, updated_at = ? WHERE id = ?', clientId, now(), id);
      },
    },

    changeRequests: {
      async create(input: NewChangeRequest) {
        const timestamp = now();
        const request: ChangeRequest = { ...input, id: newId(), created_at: timestamp, updated_at: timestamp };
        run(
          `INSERT INTO change_requests (id, client_id, batch_id, classification, confidence, original_messages,
             summary, requested_changes, client_supplied_content, attachments_required, ambiguities,
             clarification_required, lovable_prompt, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          request.id,
          request.client_id,
          request.batch_id,
          request.classification,
          request.confidence,
          JSON.stringify(request.original_messages),
          request.summary,
          JSON.stringify(request.requested_changes),
          JSON.stringify(request.client_supplied_content),
          JSON.stringify(request.attachments_required),
          JSON.stringify(request.ambiguities),
          request.clarification_required,
          request.lovable_prompt,
          request.status,
          request.created_at,
          request.updated_at,
        );
        return request;
      },
      async getById(id) {
        const row = one('SELECT * FROM change_requests WHERE id = ?', id);
        return row ? toChangeRequest(row) : null;
      },
      async getByBatchId(batchId) {
        const row = one(
          'SELECT * FROM change_requests WHERE batch_id = ? ORDER BY created_at DESC LIMIT 1',
          batchId,
        );
        return row ? toChangeRequest(row) : null;
      },
      async list({ status, clientId, limit, offset = 0 }) {
        const where: string[] = [];
        const params: unknown[] = [];
        if (status) {
          where.push('status = ?');
          params.push(status);
        }
        if (clientId) {
          where.push('client_id = ?');
          params.push(clientId);
        }
        const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
        return all(
          `SELECT * FROM change_requests ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
          ...params,
          limit,
          offset,
        ).map(toChangeRequest);
      },
      async listRecentForClient(clientId, limit) {
        return all(
          `SELECT * FROM change_requests WHERE client_id = ? ORDER BY created_at DESC LIMIT ?`,
          clientId,
          limit,
        ).map(toChangeRequest);
      },
      async updateStatus(id, status) {
        run('UPDATE change_requests SET status = ?, updated_at = ? WHERE id = ?', status, now(), id);
        const row = one('SELECT * FROM change_requests WHERE id = ?', id);
        return row ? toChangeRequest(row) : null;
      },
      async countByStatus() {
        const rows = all('SELECT status, COUNT(*) AS count FROM change_requests GROUP BY status');
        const counts: Record<string, number> = {};
        for (const row of rows) counts[text(row.status)] = num(row.count);
        return counts;
      },
    },

    rawEvents: {
      async record(eventKey, payload) {
        const result = run(
          'INSERT INTO webhook_events (event_key, payload, received_at) VALUES (?, ?, ?) ON CONFLICT(event_key) DO NOTHING',
          eventKey,
          payload,
          now(),
        );
        return Number(result.changes) === 1;
      },
      async prune(before) {
        const result = run('DELETE FROM webhook_events WHERE received_at < ?', before);
        return Number(result.changes);
      },
    },
  };
}
