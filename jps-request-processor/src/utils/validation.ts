/**
 * Validation for everything crossing a trust boundary: webhook payloads and AI
 * output. Structured outputs make the AI's shape very likely correct, but
 * "very likely" is not a contract — nothing reaches the database or the
 * dashboard without passing through here.
 */

import {
  CHANGE_TYPES,
  CLASSIFICATIONS,
  SUPPLIED_CONTENT_KINDS,
  type Analysis,
  type Ambiguity,
  type AttachmentRequirement,
  type ClientSuppliedContent,
  type RequestedChange,
} from '../types/change-request.ts';

export type Validated<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** Longest single field we will store or forward. Generous, but bounded. */
const MAX_FIELD = 4_000;
const MAX_LIST = 25;

/** Control characters other than tab, newline and carriage return. */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Strip control characters and cap the length. */
export function sanitizeText(input: unknown, maxLength = MAX_FIELD): string {
  if (typeof input !== 'string') return '';
  const cleaned = input.replace(CONTROL_CHARS, '').trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength)}…` : cleaned;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value.slice(0, MAX_LIST) : [];
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * Turn raw AI JSON into an Analysis, or explain why it cannot be trusted.
 *
 * Fields the model must get right (classification, summary) are hard errors.
 * Fields where a bad value is merely noise (a change's `type`) are coerced to a
 * safe default, because discarding a whole valid request over one enum would
 * lose real client intent.
 */
export function parseAnalysis(raw: unknown): Validated<Analysis> {
  const errors: string[] = [];
  if (!isRecord(raw)) return { ok: false, errors: ['response was not a JSON object'] };

  const classification =
    typeof raw.classification === 'string' &&
    (CLASSIFICATIONS as readonly string[]).includes(raw.classification)
      ? (raw.classification as Analysis['classification'])
      : null;
  if (!classification) errors.push(`classification must be one of ${CLASSIFICATIONS.join(', ')}`);

  const confidenceRaw = typeof raw.confidence === 'number' ? raw.confidence : Number.NaN;
  if (!Number.isFinite(confidenceRaw) || confidenceRaw < 0 || confidenceRaw > 1) {
    errors.push('confidence must be a number between 0 and 1');
  }

  const summary = sanitizeText(raw.summary);
  if (summary === '') errors.push('summary is required');

  const requested_changes: RequestedChange[] = asArray(raw.requested_changes)
    .filter(isRecord)
    .map((change) => ({
      type: oneOf(change.type, CHANGE_TYPES, 'other'),
      page: change.page == null ? null : sanitizeText(change.page, 200) || null,
      description: sanitizeText(change.description),
    }))
    .filter((change) => change.description !== '');

  const client_supplied_content: ClientSuppliedContent[] = asArray(raw.client_supplied_content)
    .filter(isRecord)
    .map((item) => ({
      kind: oneOf(item.kind, SUPPLIED_CONTENT_KINDS, 'other'),
      value: sanitizeText(item.value),
      usage: sanitizeText(item.usage),
    }))
    .filter((item) => item.value !== '');

  const attachments_required: AttachmentRequirement[] = asArray(raw.attachments_required)
    .filter(isRecord)
    .map((item) => ({
      type: oneOf(item.type, ['image', 'document', 'video', 'link', 'other'] as const, 'other'),
      purpose: sanitizeText(item.purpose),
      supplied: item.supplied === true,
    }))
    .filter((item) => item.purpose !== '');

  const ambiguities: Ambiguity[] = asArray(raw.ambiguities)
    .filter(isRecord)
    .map((item) => ({ question: sanitizeText(item.question), why: sanitizeText(item.why) }))
    .filter((item) => item.question !== '');

  const clarification_required =
    raw.clarification_required == null ? null : sanitizeText(raw.clarification_required) || null;

  if (classification === 'CHANGE_REQUEST' && requested_changes.length === 0) {
    errors.push('CHANGE_REQUEST must list at least one requested change');
  }
  if (classification === 'POSSIBLE_CHANGE' && ambiguities.length === 0 && !clarification_required) {
    errors.push('POSSIBLE_CHANGE must say what needs clarifying');
  }

  if (errors.length > 0 || !classification) return { ok: false, errors };

  return {
    ok: true,
    value: {
      classification,
      confidence: Math.min(1, Math.max(0, confidenceRaw)),
      summary,
      requested_changes,
      client_supplied_content,
      attachments_required,
      ambiguities,
      clarification_required,
    },
  };
}

/** Sections the generated Lovable prompt must contain to be worth copying. */
export const REQUIRED_PROMPT_SECTIONS = [
  'OBJECTIVE',
  'REQUESTED CHANGES',
  'SCOPE CONTROL',
  'VALIDATION',
];

export function validateLovablePrompt(prompt: unknown): Validated<string> {
  if (typeof prompt !== 'string') return { ok: false, errors: ['prompt was not text'] };
  const text = prompt.replace(CONTROL_CHARS, '').trim();
  if (text.length < 80) return { ok: false, errors: ['prompt is too short to be usable'] };
  if (text.length > 20_000) return { ok: false, errors: ['prompt is implausibly long'] };

  const missing = REQUIRED_PROMPT_SECTIONS.filter((section) => !text.includes(section));
  if (missing.length > 0) {
    return { ok: false, errors: [`prompt is missing sections: ${missing.join(', ')}`] };
  }

  return { ok: true, value: text };
}
