import type { ClientRepo } from './clients.ts';
import type { BatchRepo, MessageRepo, RawEventRepo } from './messages.ts';
import type { ChangeRequestRepo } from './change-requests.ts';

/**
 * The whole persistence surface of the app.
 *
 * Everything above this line talks to `Store` only, so swapping SQLite for
 * Supabase (or anything else later) is a one-file change.
 */
export type Store = {
  clients: ClientRepo;
  messages: MessageRepo;
  batches: BatchRepo;
  changeRequests: ChangeRequestRepo;
  rawEvents: RawEventRepo;
  /** Create tables if they do not exist. Safe to call on every boot. */
  migrate(): Promise<void>;
  close(): Promise<void>;
};
