export const ATTACHMENT_TYPES = ['image', 'video', 'audio', 'file', 'link', 'other'] as const;
export type AttachmentType = (typeof ATTACHMENT_TYPES)[number];

export type Attachment = {
  type: AttachmentType;
  /** Facebook CDN url or the link the client pasted. Expires — download early if it matters. */
  url: string | null;
  name: string | null;
};

/** One inbound Facebook message, stored exactly as received. */
export type Message = {
  id: string;
  /** Facebook's message id. Unique — this is what makes webhook retries harmless. */
  mid: string;
  batch_id: string | null;
  client_id: string | null;
  facebook_sender_id: string;
  facebook_page_id: string | null;
  text: string;
  attachments: Attachment[];
  /** When the client sent it, per Facebook. */
  sent_at: string;
  /** When we received the webhook. */
  received_at: string;
};

export type NewMessage = Omit<Message, 'id'>;

export const BATCH_STATUSES = ['OPEN', 'PROCESSING', 'DONE', 'FAILED'] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

/**
 * A burst of consecutive messages from one sender, processed as a single request.
 *
 * `process_after` is pushed forward by every new message, so the batch is only
 * picked up once the client has stopped typing for the debounce window.
 */
export type MessageBatch = {
  id: string;
  client_id: string | null;
  facebook_sender_id: string;
  status: BatchStatus;
  attempts: number;
  last_error: string | null;
  process_after: string;
  created_at: string;
  updated_at: string;
};
