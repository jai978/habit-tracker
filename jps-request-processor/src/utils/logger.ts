/**
 * Structured JSON logging with secret redaction.
 *
 * Event names are fixed strings (see EVENTS) so a whole request can be traced
 * from webhook to notification by grepping one batch id.
 */

export const EVENTS = {
  webhookReceived: 'webhook_received',
  webhookDuplicate: 'webhook_duplicate',
  webhookRejected: 'webhook_rejected',
  messageStored: 'message_stored',
  messageDuplicate: 'message_duplicate',
  batchStarted: 'message_batch_started',
  batchClaimed: 'message_batch_claimed',
  clientIdentified: 'client_identified',
  clientUnknown: 'client_unknown',
  aiStarted: 'ai_processing_started',
  aiCompleted: 'ai_processing_completed',
  aiInvalidOutput: 'ai_invalid_output',
  requestCreated: 'request_created',
  requestUpdated: 'request_updated',
  notificationSent: 'notification_sent',
  notificationFailed: 'notification_failed',
  error: 'error',
} as const;

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

const SECRET_KEY = /(token|secret|key|password|signature|authorization)/i;
/** Shapes of the credentials this app handles, in case one is pasted into a message. */
const SECRET_VALUE = /\b(sk-ant-[\w-]+|EAA[\w]{20,}|whsec_[\w]+|eyJ[\w-]+\.[\w-]+\.[\w-]+)/g;

function redact(value: unknown, key?: string): unknown {
  if (typeof value === 'string') {
    if (key && SECRET_KEY.test(key)) return '[redacted]';
    return value.replace(SECRET_VALUE, '[redacted]');
  }
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = redact(v, k);
    return out;
  }
  return value;
}

export type Logger = {
  debug: (event: string, fields?: Record<string, unknown>) => void;
  info: (event: string, fields?: Record<string, unknown>) => void;
  warn: (event: string, fields?: Record<string, unknown>) => void;
  error: (event: string, fields?: Record<string, unknown>) => void;
  child: (bindings: Record<string, unknown>) => Logger;
};

export function createLogger(level: string = 'info', bindings: Record<string, unknown> = {}): Logger {
  const threshold = LEVELS[(level as Level) in LEVELS ? (level as Level) : 'info'];

  const write = (lvl: Level, event: string, fields?: Record<string, unknown>) => {
    if (LEVELS[lvl] < threshold) return;
    const line = {
      ts: new Date().toISOString(),
      level: lvl,
      event,
      ...(redact(bindings) as Record<string, unknown>),
      ...(redact(fields ?? {}) as Record<string, unknown>),
    };
    const out = lvl === 'error' || lvl === 'warn' ? process.stderr : process.stdout;
    out.write(`${JSON.stringify(line)}\n`);
  };

  return {
    debug: (event, fields) => write('debug', event, fields),
    info: (event, fields) => write('info', event, fields),
    warn: (event, fields) => write('warn', event, fields),
    error: (event, fields) => write('error', event, fields),
    child: (extra) => createLogger(level, { ...bindings, ...extra }),
  };
}

/** Error text safe to store and log: message only, never the surrounding request. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}
