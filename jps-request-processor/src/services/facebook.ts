import { createHmac, timingSafeEqual } from 'node:crypto';

import type { Attachment, AttachmentType } from '../types/message.ts';
import { sanitizeText } from '../utils/validation.ts';

/**
 * Everything specific to Meta's Messenger webhook: signature checking and
 * turning a delivery into plain messages. Nothing here touches storage or AI,
 * so a second channel (email, SMS) can be added beside it later.
 */

export type ParsedMessage = {
  mid: string;
  senderId: string;
  pageId: string | null;
  text: string;
  attachments: Attachment[];
  sentAt: string;
};

/**
 * Verify Meta's X-Hub-Signature-256 header against the raw request body.
 *
 * Must run on the exact bytes Meta sent — re-serialising the parsed JSON
 * changes them and the signature will never match.
 */
export function verifySignature(rawBody: Buffer, header: string | undefined, appSecret: string): boolean {
  if (!header) return false;
  const [algorithm, provided] = header.split('=');
  if (algorithm !== 'sha256' || !provided) return false;

  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const providedBuffer = Buffer.from(provided, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

/** Meta's subscription handshake: echo hub.challenge when the token matches. */
export function verifySubscription(
  query: Record<string, unknown>,
  verifyToken: string,
): { ok: true; challenge: string } | { ok: false; reason: string } {
  const mode = typeof query['hub.mode'] === 'string' ? query['hub.mode'] : '';
  const token = typeof query['hub.verify_token'] === 'string' ? query['hub.verify_token'] : '';
  const challenge = typeof query['hub.challenge'] === 'string' ? query['hub.challenge'] : '';

  if (mode !== 'subscribe') return { ok: false, reason: 'unexpected hub.mode' };
  if (token.length !== verifyToken.length) return { ok: false, reason: 'verify token mismatch' };
  if (!timingSafeEqual(Buffer.from(token), Buffer.from(verifyToken))) {
    return { ok: false, reason: 'verify token mismatch' };
  }
  if (!challenge) return { ok: false, reason: 'missing hub.challenge' };
  return { ok: true, challenge };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const ATTACHMENT_MAP: Record<string, AttachmentType> = {
  image: 'image',
  video: 'video',
  audio: 'audio',
  file: 'file',
  // Meta sends shared links and unsupported share types as "fallback".
  fallback: 'link',
};

function parseAttachments(raw: unknown): Attachment[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord).map((attachment) => {
    const payload = isRecord(attachment.payload) ? attachment.payload : {};
    const type = typeof attachment.type === 'string' ? attachment.type : 'other';
    return {
      type: ATTACHMENT_MAP[type] ?? 'other',
      url: typeof payload.url === 'string' ? payload.url : null,
      name: typeof attachment.title === 'string' ? sanitizeText(attachment.title, 300) : null,
    };
  });
}

/**
 * Pull client messages out of a webhook body.
 *
 * Anything that is not an inbound text or attachment message — delivery
 * receipts, read receipts, and echoes of our own replies — is ignored.
 */
export function parseWebhookBody(body: unknown): ParsedMessage[] {
  if (!isRecord(body) || body.object !== 'page' || !Array.isArray(body.entry)) return [];

  const messages: ParsedMessage[] = [];

  for (const entry of body.entry) {
    if (!isRecord(entry)) continue;
    const pageId = typeof entry.id === 'string' ? entry.id : null;
    const events = Array.isArray(entry.messaging) ? entry.messaging : [];

    for (const event of events) {
      if (!isRecord(event)) continue;
      const message = isRecord(event.message) ? event.message : null;
      if (!message) continue;
      if (message.is_echo === true) continue;

      const mid = typeof message.mid === 'string' ? message.mid : '';
      const sender = isRecord(event.sender) ? event.sender : {};
      const senderId = typeof sender.id === 'string' ? sender.id : '';
      if (!mid || !senderId) continue;

      const timestamp = typeof event.timestamp === 'number' ? event.timestamp : Date.now();
      const attachments = parseAttachments(message.attachments);
      const text = sanitizeText(message.text, 10_000);

      // A message with neither text nor attachments carries nothing to interpret.
      if (text === '' && attachments.length === 0) continue;

      messages.push({
        mid,
        senderId,
        pageId,
        text,
        attachments,
        sentAt: new Date(timestamp).toISOString(),
      });
    }
  }

  return messages;
}
