import type { Config } from '../config.ts';
import type { Store } from '../db/index.ts';
import type { MessageBatch } from '../types/message.ts';
import type { ChangeRequest, NewChangeRequest, RequestStatus } from '../types/change-request.ts';
import type { ParsedMessage } from './facebook.ts';
import type { AiService } from './ai.ts';
import type { Notifier } from './notifications.ts';
import { buildRequestContext, clientLabel } from './client-context.ts';
import { EVENTS, errorMessage, type Logger } from '../utils/logger.ts';

/**
 * The pipeline: store messages, wait for the burst to finish, interpret it,
 * write a request, tell JPS.
 *
 * Two invariants shape this file. A stored message is never lost — every
 * failure path leaves the batch retryable rather than dropping it. And nothing
 * here changes a website; the output is always a record plus a notification.
 */

export type RequestProcessor = {
  /** Store inbound messages and (re)start the debounce timer for their sender. */
  ingest(messages: ParsedMessage[]): Promise<{ stored: number; duplicates: number }>;
  /** Process every batch whose debounce window has closed. Returns how many ran. */
  runDue(): Promise<number>;
  processBatch(batch: MessageBatch): Promise<ChangeRequest | null>;
};

export function createRequestProcessor(deps: {
  config: Config;
  store: Store;
  ai: AiService;
  notifier: Notifier;
  logger: Logger;
}): RequestProcessor {
  const { config, store, ai, notifier, logger } = deps;

  async function ingest(messages: ParsedMessage[]) {
    let stored = 0;
    let duplicates = 0;

    for (const message of messages) {
      const client = await store.clients.getByFacebookSenderId(message.senderId);
      const processAfter = new Date(Date.now() + config.processing.debounceMs).toISOString();

      let batch = await store.batches.findOpenForSender(message.senderId);
      if (!batch) {
        batch = await store.batches.create({
          facebook_sender_id: message.senderId,
          client_id: client?.id ?? null,
          process_after: processAfter,
        });
        logger.info(EVENTS.batchStarted, {
          batch_id: batch.id,
          sender_id: message.senderId,
          client_id: client?.id ?? null,
        });
      }

      const inserted = await store.messages.insertIfNew({
        mid: message.mid,
        batch_id: batch.id,
        client_id: client?.id ?? null,
        facebook_sender_id: message.senderId,
        facebook_page_id: message.pageId,
        text: message.text,
        attachments: message.attachments,
        sent_at: message.sentAt,
        received_at: new Date().toISOString(),
      });

      if (!inserted) {
        // Meta retries deliver the same mid. The batch timer is deliberately not
        // extended: a retry is not the client still typing.
        duplicates += 1;
        logger.info(EVENTS.messageDuplicate, { mid: message.mid, sender_id: message.senderId });
        continue;
      }

      stored += 1;
      logger.info(EVENTS.messageStored, {
        message_id: inserted.id,
        batch_id: batch.id,
        sender_id: message.senderId,
        has_attachments: message.attachments.length > 0,
      });

      // Every new message pushes the deadline out, so a burst is processed once.
      await store.batches.extend(batch.id, processAfter);
    }

    return { stored, duplicates };
  }

  /** Low confidence, missing files or open questions mean a human decides before Lovable does. */
  function decideStatus(analysis: {
    classification: string;
    confidence: number;
    ambiguities: unknown[];
    attachments_required: { supplied: boolean }[];
  }): RequestStatus {
    if (analysis.classification === 'OTHER') return 'IGNORED';
    if (analysis.classification === 'POSSIBLE_CHANGE') return 'NEEDS_CLARIFICATION';
    if (analysis.confidence < config.processing.confidenceThreshold) return 'NEEDS_CLARIFICATION';
    if (analysis.ambiguities.length > 0) return 'NEEDS_CLARIFICATION';
    if (analysis.attachments_required.some((attachment) => !attachment.supplied)) return 'NEEDS_CLARIFICATION';
    return 'NEW';
  }

  async function processBatch(batch: MessageBatch): Promise<ChangeRequest | null> {
    const scoped = logger.child({ batch_id: batch.id });
    const context = await buildRequestContext(store, config, batch);

    if (context.batchMessages.length === 0) {
      // Can happen when every message in a freshly created batch was a duplicate.
      scoped.info(EVENTS.batchClaimed, { outcome: 'empty' });
      await store.batches.markDone(batch.id);
      return null;
    }

    const existing = await store.changeRequests.getByBatchId(batch.id);
    if (existing && existing.classification !== 'UNKNOWN_CLIENT') {
      // A retry after the request was already written. Do not create a second one.
      scoped.info(EVENTS.batchClaimed, { outcome: 'already_processed', request_id: existing.id });
      await store.batches.markDone(batch.id);
      return existing;
    }

    const originalMessages = context.batchMessages.map((message) => ({
      mid: message.mid,
      text: message.text,
      attachments: message.attachments,
      sent_at: message.sent_at,
    }));

    // An unidentified sender is never guessed onto a client, and never sent to
    // the model — JPS links the sender first, then the batch is reprocessed.
    if (!context.client) {
      scoped.info(EVENTS.clientUnknown, { sender_id: batch.facebook_sender_id });
      const record: NewChangeRequest = {
        client_id: null,
        batch_id: batch.id,
        classification: 'UNKNOWN_CLIENT',
        confidence: 0,
        original_messages: originalMessages,
        summary: `Message from an unrecognised Facebook sender (${batch.facebook_sender_id}).`,
        requested_changes: [],
        client_supplied_content: [],
        attachments_required: [],
        ambiguities: [
          {
            question: 'Which client is this sender?',
            why: 'The sender id is not linked to a client, so their site and context are unknown.',
          },
        ],
        clarification_required:
          'Link this Facebook sender to a client in the dashboard, then reprocess the batch.',
        lovable_prompt: null,
        status: 'NEEDS_CLARIFICATION',
      };
      const created = await store.changeRequests.create(record);
      await store.batches.markDone(batch.id);
      await notifier.requestCreated(created, null);
      scoped.info(EVENTS.requestCreated, { request_id: created.id, classification: 'UNKNOWN_CLIENT' });
      return created;
    }

    const client = context.client;
    scoped.info(EVENTS.clientIdentified, { client_id: client.id, business: client.business_name });

    if (batch.client_id !== client.id) {
      await store.batches.setClient(batch.id, client.id);
      await store.messages.assignClientForBatch(batch.id, client.id);
    }

    const analysis = await ai.classify(context);

    const status = decideStatus(analysis);
    const lovablePrompt =
      analysis.classification === 'CHANGE_REQUEST'
        ? await ai.generateLovablePrompt(client, analysis, context.batchMessages)
        : null;

    const created = await store.changeRequests.create({
      client_id: client.id,
      batch_id: batch.id,
      classification: analysis.classification,
      confidence: analysis.confidence,
      original_messages: originalMessages,
      summary: analysis.summary,
      requested_changes: analysis.requested_changes,
      client_supplied_content: analysis.client_supplied_content,
      attachments_required: analysis.attachments_required,
      ambiguities: analysis.ambiguities,
      clarification_required: analysis.clarification_required,
      lovable_prompt: lovablePrompt,
      status,
    });

    await store.batches.markDone(batch.id);
    scoped.info(EVENTS.requestCreated, {
      request_id: created.id,
      client: clientLabel(client),
      classification: created.classification,
      confidence: created.confidence,
      status: created.status,
      has_prompt: Boolean(lovablePrompt),
    });

    await notifier.requestCreated(created, client);
    return created;
  }

  async function runDue(): Promise<number> {
    const nowIso = new Date().toISOString();
    const batches = await store.batches.claimDue(nowIso, config.processing.batchLimit);

    for (const batch of batches) {
      try {
        await processBatch(batch);
      } catch (error) {
        const reason = errorMessage(error);
        const attempts = batch.attempts + 1;
        const exhausted = attempts >= config.processing.maxAttempts;
        const retryAt = exhausted
          ? null
          : new Date(Date.now() + config.processing.retryBaseMs * 2 ** batch.attempts).toISOString();

        await store.batches.markFailed(batch.id, reason, retryAt);
        logger.error(EVENTS.error, {
          stage: 'process_batch',
          batch_id: batch.id,
          attempts,
          will_retry: !exhausted,
          retry_at: retryAt,
          reason,
        });

        // The messages are still stored either way; only the alert differs.
        if (exhausted) await notifier.processingFailed(batch.id, batch.facebook_sender_id, reason);
      }
    }

    return batches.length;
  }

  return { ingest, runDue, processBatch };
}
