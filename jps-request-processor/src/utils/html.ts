/**
 * Client messages are untrusted text and end up on the dashboard and in
 * Telegram. Everything interpolated into markup goes through escapeHtml.
 */
const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ENTITIES[char] ?? char);
}

/** Telegram's HTML parse mode only needs these three escaped. */
export function escapeTelegram(value: unknown): string {
  return String(value ?? '').replace(/[&<>]/g, (char) => ENTITIES[char] ?? char);
}
