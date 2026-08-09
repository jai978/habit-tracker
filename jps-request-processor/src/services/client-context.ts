import type { Config } from '../config.ts';
import type { Store } from '../db/index.ts';
import type { Client } from '../types/client.ts';
import type { Message, MessageBatch } from '../types/message.ts';
import type { ChangeRequest } from '../types/change-request.ts';

/**
 * Everything the AI is allowed to see about one request.
 *
 * Deliberately bounded: a fixed number of recent messages inside a time window,
 * plus a few previous website requests. Enough to resolve "the photo I mentioned",
 * not so much that every call re-reads a year of chat.
 */
export type RequestContext = {
  client: Client | null;
  batch: MessageBatch;
  /** The messages being interpreted right now, oldest first. */
  batchMessages: Message[];
  /** Earlier messages from the same sender, oldest first, excluding the batch. */
  recentMessages: Message[];
  /** This client's most recent website requests, newest first. */
  recentRequests: ChangeRequest[];
};

export async function buildRequestContext(
  store: Store,
  config: Config,
  batch: MessageBatch,
): Promise<RequestContext> {
  const batchMessages = await store.messages.listByBatch(batch.id);

  const client = batch.client_id
    ? await store.clients.getById(batch.client_id)
    : await store.clients.getByFacebookSenderId(batch.facebook_sender_id);

  const since = new Date(
    Date.now() - config.processing.contextWindowHours * 60 * 60 * 1000,
  ).toISOString();

  const batchMids = new Set(batchMessages.map((message) => message.mid));
  const recent = await store.messages.listRecentForSender(batch.facebook_sender_id, {
    // Ask for extra: the batch's own messages are in this window and get filtered out.
    limit: config.processing.contextMessageLimit + batchMessages.length,
    since,
  });
  const recentMessages = recent
    .filter((message) => !batchMids.has(message.mid))
    .slice(0, config.processing.contextMessageLimit)
    .reverse();

  const recentRequests = client
    ? await store.changeRequests.listRecentForClient(client.id, config.processing.contextRequestLimit)
    : [];

  return { client, batch, batchMessages, recentMessages, recentRequests };
}

/** Human label for logs, notifications and the dashboard. */
export function clientLabel(client: Client | null): string {
  return client ? client.business_name : 'Unknown sender';
}
