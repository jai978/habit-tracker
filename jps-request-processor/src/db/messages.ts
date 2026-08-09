import type { Message, MessageBatch, NewMessage } from '../types/message.ts';

export type MessageRepo = {
  /**
   * Insert a message, or return null if Facebook's `mid` has already been seen.
   * This is the single point where duplicate webhook deliveries are collapsed.
   */
  insertIfNew(message: NewMessage): Promise<Message | null>;
  listByBatch(batchId: string): Promise<Message[]>;
  /** Recent messages from this sender, newest first, for conversation context. */
  listRecentForSender(senderId: string, options: { limit: number; since: string }): Promise<Message[]>;
  /** Re-point a batch's messages at a client once the sender has been identified. */
  assignClientForBatch(batchId: string, clientId: string): Promise<void>;
};

export type BatchRepo = {
  getById(id: string): Promise<MessageBatch | null>;
  /** The batch currently collecting messages from this sender, if any. */
  findOpenForSender(senderId: string): Promise<MessageBatch | null>;
  create(input: {
    facebook_sender_id: string;
    client_id: string | null;
    process_after: string;
  }): Promise<MessageBatch>;
  /** Push the debounce deadline out because another message just arrived. */
  extend(id: string, processAfter: string): Promise<void>;
  /**
   * Atomically take ownership of batches whose debounce window has closed.
   * Returns only the batches this caller claimed, so concurrent workers or an
   * overlapping tick cannot process the same batch twice.
   */
  claimDue(now: string, limit: number): Promise<MessageBatch[]>;
  markDone(id: string): Promise<void>;
  /** Return the batch to the queue with a delay, or park it if attempts ran out. */
  markFailed(id: string, error: string, retryAt: string | null): Promise<void>;
  /**
   * Return batches stuck in PROCESSING to the queue. A process killed mid-batch
   * leaves its claim behind; without this the batch would never run again.
   */
  reclaimStuck(claimedBefore: string, processAfter: string): Promise<number>;
  /** Batches parked after exhausting retries — surfaced in the dashboard for manual retry. */
  listFailed(limit: number): Promise<MessageBatch[]>;
  /** Put a parked batch back in the queue. */
  requeue(id: string, processAfter: string): Promise<MessageBatch | null>;
  setClient(id: string, clientId: string): Promise<void>;
};

export type RawEventRepo = {
  /**
   * Record a raw webhook delivery for debugging. Returns false when this exact
   * payload has already been recorded (Meta retries deliver byte-identical bodies).
   */
  record(eventKey: string, payload: string): Promise<boolean>;
  prune(before: string): Promise<number>;
};
