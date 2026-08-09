import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Store } from './store.ts';
import type { Client, ClientPatch, NewClient } from '../types/client.ts';
import type { Message, MessageBatch, NewMessage } from '../types/message.ts';
import type { ChangeRequest, NewChangeRequest, RequestStatus } from '../types/change-request.ts';

/**
 * Supabase (Postgres) storage, for hosts with an ephemeral filesystem.
 *
 * Uses the service role key, so it must only ever run server-side. Tables are
 * created by db/schema.sql — Supabase has no migration endpoint, so migrate()
 * verifies the schema is present rather than creating it.
 */

const UNIQUE_VIOLATION = '23505';

type Row = Record<string, unknown>;

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const nullableText = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const num = (value: unknown): number => (typeof value === 'number' ? value : Number(value ?? 0));
const list = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

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
    active: row.active !== false,
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
    attachments: list(row.attachments),
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
    original_messages: list(row.original_messages),
    summary: text(row.summary),
    requested_changes: list(row.requested_changes),
    client_supplied_content: list(row.client_supplied_content),
    attachments_required: list(row.attachments_required),
    ambiguities: list(row.ambiguities),
    clarification_required: nullableText(row.clarification_required),
    lovable_prompt: nullableText(row.lovable_prompt),
    status: text(row.status) as RequestStatus,
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
  };
}

export function createSupabaseStore(url: string, serviceKey: string, prefix = 'jps_'): Store {
  const db: SupabaseClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const CLIENTS = `${prefix}clients`;
  const MESSAGES = `${prefix}messages`;
  const BATCHES = `${prefix}message_batches`;
  const REQUESTS = `${prefix}change_requests`;
  const EVENTS = `${prefix}webhook_events`;

  const now = () => new Date().toISOString();

  /** Supabase returns errors in-band; turn them into exceptions so callers can retry. */
  function unwrap<T>(result: { data: T | null; error: { message: string } | null }, action: string): T {
    if (result.error) throw new Error(`Supabase ${action} failed: ${result.error.message}`);
    if (result.data === null) throw new Error(`Supabase ${action} returned no data`);
    return result.data;
  }

  return {
    async migrate() {
      // Postgres DDL cannot be issued over PostgREST — schema.sql is applied by
      // the operator. Fail loudly at boot rather than on the first webhook.
      const { error } = await db.from(CLIENTS).select('id').limit(1);
      if (error) {
        throw new Error(
          `Supabase schema is not ready (${error.message}). Run src/db/schema.sql in the Supabase SQL editor.`,
        );
      }
    },

    async close() {
      /* PostgREST is stateless; nothing to close. */
    },

    clients: {
      async getById(id) {
        const { data, error } = await db.from(CLIENTS).select('*').eq('id', id).maybeSingle();
        if (error) throw new Error(`Supabase client lookup failed: ${error.message}`);
        return data ? toClient(data as Row) : null;
      },
      async getByFacebookSenderId(senderId) {
        const { data, error } = await db
          .from(CLIENTS)
          .select('*')
          .eq('facebook_sender_id', senderId)
          .eq('active', true)
          .maybeSingle();
        if (error) throw new Error(`Supabase client lookup failed: ${error.message}`);
        return data ? toClient(data as Row) : null;
      },
      async list() {
        const rows = unwrap(await db.from(CLIENTS).select('*').order('business_name'), 'client list');
        return (rows as Row[]).map(toClient);
      },
      async create(input: NewClient) {
        const timestamp = now();
        const rows = unwrap(
          await db
            .from(CLIENTS)
            .insert({
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
            })
            .select(),
          'client insert',
        );
        return toClient((rows as Row[])[0] ?? {});
      },
      async update(id, patch: ClientPatch) {
        const changes: Row = { updated_at: now() };
        for (const [key, value] of Object.entries(patch)) {
          if (value !== undefined) changes[key] = value;
        }
        const rows = unwrap(await db.from(CLIENTS).update(changes).eq('id', id).select(), 'client update');
        const row = (rows as Row[])[0];
        return row ? toClient(row) : null;
      },
    },

    messages: {
      async insertIfNew(message: NewMessage) {
        const { data, error } = await db.from(MESSAGES).insert({ ...message }).select();
        if (error) {
          if (error.code === UNIQUE_VIOLATION) return null;
          throw new Error(`Supabase message insert failed: ${error.message}`);
        }
        const row = (data as Row[])[0];
        return row ? toMessage(row) : null;
      },
      async listByBatch(batchId) {
        const rows = unwrap(
          await db.from(MESSAGES).select('*').eq('batch_id', batchId).order('sent_at'),
          'message list',
        );
        return (rows as Row[]).map(toMessage);
      },
      async listRecentForSender(senderId, { limit, since }) {
        const rows = unwrap(
          await db
            .from(MESSAGES)
            .select('*')
            .eq('facebook_sender_id', senderId)
            .gte('sent_at', since)
            .order('sent_at', { ascending: false })
            .limit(limit),
          'recent message list',
        );
        return (rows as Row[]).map(toMessage);
      },
      async assignClientForBatch(batchId, clientId) {
        const { error } = await db.from(MESSAGES).update({ client_id: clientId }).eq('batch_id', batchId);
        if (error) throw new Error(`Supabase message reassign failed: ${error.message}`);
      },
    },

    batches: {
      async getById(id) {
        const { data, error } = await db.from(BATCHES).select('*').eq('id', id).maybeSingle();
        if (error) throw new Error(`Supabase batch lookup failed: ${error.message}`);
        return data ? toBatch(data as Row) : null;
      },
      async findOpenForSender(senderId) {
        const { data, error } = await db
          .from(BATCHES)
          .select('*')
          .eq('facebook_sender_id', senderId)
          .eq('status', 'OPEN')
          .order('created_at', { ascending: false })
          .limit(1);
        if (error) throw new Error(`Supabase batch lookup failed: ${error.message}`);
        const row = (data as Row[])[0];
        return row ? toBatch(row) : null;
      },
      async create(input) {
        const timestamp = now();
        const rows = unwrap(
          await db
            .from(BATCHES)
            .insert({
              client_id: input.client_id,
              facebook_sender_id: input.facebook_sender_id,
              status: 'OPEN',
              attempts: 0,
              last_error: null,
              process_after: input.process_after,
              created_at: timestamp,
              updated_at: timestamp,
            })
            .select(),
          'batch insert',
        );
        return toBatch((rows as Row[])[0] ?? {});
      },
      async extend(id, processAfter) {
        const { error } = await db
          .from(BATCHES)
          .update({ process_after: processAfter, updated_at: now() })
          .eq('id', id)
          .eq('status', 'OPEN');
        if (error) throw new Error(`Supabase batch extend failed: ${error.message}`);
      },
      async claimDue(nowIso, limit) {
        const candidates = unwrap(
          await db
            .from(BATCHES)
            .select('id')
            .eq('status', 'OPEN')
            .lte('process_after', nowIso)
            .order('process_after')
            .limit(limit),
          'due batch list',
        );

        const claimed: MessageBatch[] = [];
        for (const candidate of candidates as Row[]) {
          // The status filter makes the claim atomic: a second worker updating
          // the same row sees status = PROCESSING and gets zero rows back.
          const { data, error } = await db
            .from(BATCHES)
            .update({ status: 'PROCESSING', updated_at: now() })
            .eq('id', candidate.id as string)
            .eq('status', 'OPEN')
            .select();
          if (error) throw new Error(`Supabase batch claim failed: ${error.message}`);
          const row = (data as Row[])[0];
          if (row) claimed.push(toBatch(row));
        }
        return claimed;
      },
      async markDone(id) {
        const { error } = await db
          .from(BATCHES)
          .update({ status: 'DONE', last_error: null, updated_at: now() })
          .eq('id', id);
        if (error) throw new Error(`Supabase batch update failed: ${error.message}`);
      },
      async markFailed(id, errorText, retryAt) {
        const current = unwrap(await db.from(BATCHES).select('attempts').eq('id', id), 'batch attempts');
        const attempts = num((current as Row[])[0]?.attempts) + 1;
        const changes: Row = { attempts, last_error: errorText, updated_at: now() };
        if (retryAt) {
          changes.status = 'OPEN';
          changes.process_after = retryAt;
        } else {
          changes.status = 'FAILED';
        }
        const { error } = await db.from(BATCHES).update(changes).eq('id', id);
        if (error) throw new Error(`Supabase batch update failed: ${error.message}`);
      },
      async reclaimStuck(claimedBefore, processAfter) {
        const rows = unwrap(
          await db
            .from(BATCHES)
            .update({ status: 'OPEN', process_after: processAfter, updated_at: now() })
            .eq('status', 'PROCESSING')
            .lt('updated_at', claimedBefore)
            .select(),
          'batch reclaim',
        );
        return (rows as Row[]).length;
      },
      async listFailed(limit) {
        const rows = unwrap(
          await db
            .from(BATCHES)
            .select('*')
            .eq('status', 'FAILED')
            .order('updated_at', { ascending: false })
            .limit(limit),
          'failed batch list',
        );
        return (rows as Row[]).map(toBatch);
      },
      async requeue(id, processAfter) {
        const rows = unwrap(
          await db
            .from(BATCHES)
            .update({ status: 'OPEN', attempts: 0, process_after: processAfter, updated_at: now() })
            .eq('id', id)
            .select(),
          'batch requeue',
        );
        const row = (rows as Row[])[0];
        return row ? toBatch(row) : null;
      },
      async setClient(id, clientId) {
        const { error } = await db.from(BATCHES).update({ client_id: clientId, updated_at: now() }).eq('id', id);
        if (error) throw new Error(`Supabase batch update failed: ${error.message}`);
      },
    },

    changeRequests: {
      async create(input: NewChangeRequest) {
        const timestamp = now();
        const rows = unwrap(
          await db
            .from(REQUESTS)
            .insert({ ...input, created_at: timestamp, updated_at: timestamp })
            .select(),
          'request insert',
        );
        return toChangeRequest((rows as Row[])[0] ?? {});
      },
      async getById(id) {
        const { data, error } = await db.from(REQUESTS).select('*').eq('id', id).maybeSingle();
        if (error) throw new Error(`Supabase request lookup failed: ${error.message}`);
        return data ? toChangeRequest(data as Row) : null;
      },
      async getByBatchId(batchId) {
        const { data, error } = await db
          .from(REQUESTS)
          .select('*')
          .eq('batch_id', batchId)
          .order('created_at', { ascending: false })
          .limit(1);
        if (error) throw new Error(`Supabase request lookup failed: ${error.message}`);
        const row = (data as Row[])[0];
        return row ? toChangeRequest(row) : null;
      },
      async list({ status, clientId, limit, offset = 0 }) {
        let query = db.from(REQUESTS).select('*');
        if (status) query = query.eq('status', status);
        if (clientId) query = query.eq('client_id', clientId);
        const rows = unwrap(
          await query.order('created_at', { ascending: false }).range(offset, offset + limit - 1),
          'request list',
        );
        return (rows as Row[]).map(toChangeRequest);
      },
      async listRecentForClient(clientId, limit) {
        const rows = unwrap(
          await db
            .from(REQUESTS)
            .select('*')
            .eq('client_id', clientId)
            .order('created_at', { ascending: false })
            .limit(limit),
          'client request list',
        );
        return (rows as Row[]).map(toChangeRequest);
      },
      async updateStatus(id, status) {
        const rows = unwrap(
          await db.from(REQUESTS).update({ status, updated_at: now() }).eq('id', id).select(),
          'request status update',
        );
        const row = (rows as Row[])[0];
        return row ? toChangeRequest(row) : null;
      },
      async countByStatus() {
        const rows = unwrap(await db.from(REQUESTS).select('status'), 'request status counts');
        const counts: Record<string, number> = {};
        for (const row of rows as Row[]) {
          const status = text(row.status);
          counts[status] = (counts[status] ?? 0) + 1;
        }
        return counts;
      },
    },

    rawEvents: {
      async record(eventKey, payload) {
        const { error } = await db
          .from(EVENTS)
          .insert({ event_key: eventKey, payload, received_at: now() });
        if (error) {
          if (error.code === UNIQUE_VIOLATION) return false;
          throw new Error(`Supabase webhook event insert failed: ${error.message}`);
        }
        return true;
      },
      async prune(before) {
        const rows = unwrap(await db.from(EVENTS).delete().lt('received_at', before).select(), 'event prune');
        return (rows as Row[]).length;
      },
    },
  };
}
