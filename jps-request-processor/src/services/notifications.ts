import type { Config } from '../config.ts';
import type { Client } from '../types/client.ts';
import type { ChangeRequest } from '../types/change-request.ts';
import { escapeTelegram } from '../utils/html.ts';
import { EVENTS, errorMessage, type Logger } from '../utils/logger.ts';

/**
 * How a finished request reaches JPS.
 *
 * Telegram is the fast path — the Lovable prompt arrives as a code block, which
 * Telegram makes tap-to-copy. The dashboard is the durable one. A notification
 * failure is logged and swallowed: the request is already stored, and losing an
 * alert must never lose the work.
 */

export type Notifier = {
  requestCreated(request: ChangeRequest, client: Client | null): Promise<void>;
  processingFailed(batchId: string, senderId: string, error: string): Promise<void>;
};

const TELEGRAM_LIMIT = 4096;
/** Leaves room for the <pre> wrapper and the truncation note. */
const PROMPT_CHUNK = 3800;

function heading(request: ChangeRequest): string {
  switch (request.classification) {
    case 'CHANGE_REQUEST':
      return '🔧 WEBSITE CHANGE';
    case 'POSSIBLE_CHANGE':
      return '❓ POSSIBLE CHANGE — needs clarification';
    case 'UNKNOWN_CLIENT':
      return '👤 UNKNOWN SENDER';
    default:
      return 'ℹ️ MESSAGE';
  }
}

export function buildTelegramSummary(
  request: ChangeRequest,
  client: Client | null,
  dashboardUrl: string,
): string {
  const lines: string[] = [];
  lines.push(`<b>${escapeTelegram(heading(request))}</b>`);
  lines.push('');
  lines.push(`<b>CLIENT</b>\n${escapeTelegram(client?.business_name ?? 'Unrecognised Facebook sender')}`);
  lines.push('');
  lines.push(`<b>REQUEST</b>\n${escapeTelegram(request.summary)}`);
  lines.push('');
  lines.push(`<b>CONFIDENCE</b>\n${Math.round(request.confidence * 100)}%`);

  const original = request.original_messages
    .map((message) => message.text.trim())
    .filter((text) => text !== '')
    .join(' / ');
  if (original) {
    lines.push('');
    lines.push(`<b>ORIGINAL MESSAGE</b>\n"${escapeTelegram(original.slice(0, 600))}"`);
  }

  if (request.requested_changes.length > 0) {
    lines.push('');
    lines.push('<b>AI INTERPRETATION</b>');
    for (const change of request.requested_changes) {
      const page = change.page ? ` (${change.page})` : '';
      lines.push(`• ${escapeTelegram(change.description)}${escapeTelegram(page)}`);
    }
  }

  if (request.ambiguities.length > 0) {
    lines.push('');
    lines.push('<b>NEEDS CLARIFICATION</b>');
    for (const item of request.ambiguities) lines.push(`• ${escapeTelegram(item.question)}`);
  }

  if (request.clarification_required) {
    lines.push('');
    lines.push(escapeTelegram(request.clarification_required));
  }

  lines.push('');
  lines.push(`Status: ${escapeTelegram(request.status)}`);
  lines.push(`<a href="${escapeTelegram(dashboardUrl)}">Open in dashboard</a>`);

  const message = lines.join('\n');
  return message.length > TELEGRAM_LIMIT ? `${message.slice(0, TELEGRAM_LIMIT - 3)}...` : message;
}

/**
 * Which requests are worth interrupting the operator for. Conversation that
 * asked for nothing is recorded but never announced.
 */
export function shouldNotify(request: ChangeRequest, config: Config): boolean {
  if (request.classification === 'OTHER') return false;
  if (request.classification === 'POSSIBLE_CHANGE') return config.notifications.notifyPossibleChange;
  return true;
}

export function createNotifier(config: Config, logger: Logger): Notifier {
  const { telegramBotToken, telegramChatId } = config.notifications;
  const telegramEnabled = Boolean(telegramBotToken && telegramChatId);

  async function sendTelegram(text: string, options: { preformatted?: boolean } = {}): Promise<void> {
    if (!telegramEnabled) return;
    const body = {
      chat_id: telegramChatId,
      text: options.preformatted ? `<pre>${text}</pre>` : text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    };
    const response = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      // Telegram puts the reason in the body; the token is only ever in the URL.
      throw new Error(`Telegram responded ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
  }

  return {
    async requestCreated(request, client) {
      const dashboardUrl = `${config.publicUrl}/dashboard/requests/${request.id}`;

      if (!shouldNotify(request, config)) return;

      if (!telegramEnabled) {
        logger.info(EVENTS.notificationSent, {
          channel: 'log',
          request_id: request.id,
          classification: request.classification,
          url: dashboardUrl,
        });
        return;
      }

      try {
        await sendTelegram(buildTelegramSummary(request, client, dashboardUrl));

        if (request.lovable_prompt) {
          const prompt = escapeTelegram(request.lovable_prompt);
          if (prompt.length <= PROMPT_CHUNK) {
            await sendTelegram(prompt, { preformatted: true });
          } else {
            await sendTelegram(
              `${prompt.slice(0, PROMPT_CHUNK)}\n\n[truncated — open the dashboard to copy the full prompt]`,
              { preformatted: true },
            );
          }
        }

        logger.info(EVENTS.notificationSent, {
          channel: 'telegram',
          request_id: request.id,
          classification: request.classification,
        });
      } catch (error) {
        logger.error(EVENTS.notificationFailed, {
          channel: 'telegram',
          request_id: request.id,
          reason: errorMessage(error),
        });
      }
    },

    async processingFailed(batchId, senderId, error) {
      const text =
        `<b>⚠️ PROCESSING FAILED</b>\n\nA message batch could not be analysed and has been parked for retry.\n\n` +
        `Sender: ${escapeTelegram(senderId)}\nBatch: ${escapeTelegram(batchId)}\nReason: ${escapeTelegram(error)}\n\n` +
        `<a href="${escapeTelegram(config.publicUrl)}/dashboard/failed">Open failed batches</a>`;

      if (!telegramEnabled) {
        logger.warn(EVENTS.notificationSent, { channel: 'log', batch_id: batchId, reason: error });
        return;
      }
      try {
        await sendTelegram(text);
        logger.info(EVENTS.notificationSent, { channel: 'telegram', batch_id: batchId, kind: 'failure' });
      } catch (sendError) {
        logger.error(EVENTS.notificationFailed, {
          channel: 'telegram',
          batch_id: batchId,
          reason: errorMessage(sendError),
        });
      }
    },
  };
}
