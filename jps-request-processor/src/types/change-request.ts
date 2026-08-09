import type { Attachment } from './message.ts';

/** What the AI is allowed to decide. */
export const CLASSIFICATIONS = ['CHANGE_REQUEST', 'POSSIBLE_CHANGE', 'OTHER'] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

/**
 * What we store. `UNKNOWN_CLIENT` is assigned by the backend, never by the AI —
 * an unrecognised sender is never guessed onto an existing client.
 */
export type StoredClassification = Classification | 'UNKNOWN_CLIENT';

export const CHANGE_TYPES = [
  'content_addition',
  'content_edit',
  'content_removal',
  'image_change',
  'contact_details',
  'layout_or_styling',
  'new_page',
  'seo',
  'other',
] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

export type RequestedChange = {
  type: ChangeType;
  /** Path or page name the client referred to, or null if they didn't say. */
  page: string | null;
  description: string;
};

export const SUPPLIED_CONTENT_KINDS = [
  'text',
  'phone',
  'email',
  'address',
  'url',
  'hours',
  'other',
] as const;
export type SuppliedContentKind = (typeof SUPPLIED_CONTENT_KINDS)[number];

/** Exact wording/values the client supplied, kept verbatim so nothing is paraphrased into the site. */
export type ClientSuppliedContent = {
  kind: SuppliedContentKind;
  value: string;
  usage: string;
};

export type AttachmentRequirement = {
  type: 'image' | 'document' | 'video' | 'link' | 'other';
  purpose: string;
  /** True when the client actually attached it to this batch. */
  supplied: boolean;
};

export type Ambiguity = {
  question: string;
  why: string;
};

/** The validated structured output of the classification call. */
export type Analysis = {
  classification: Classification;
  confidence: number;
  summary: string;
  requested_changes: RequestedChange[];
  client_supplied_content: ClientSuppliedContent[];
  attachments_required: AttachmentRequirement[];
  ambiguities: Ambiguity[];
  clarification_required: string | null;
};

export const REQUEST_STATUSES = [
  'NEW',
  'REVIEWED',
  'IMPLEMENTED',
  'IGNORED',
  'NEEDS_CLARIFICATION',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** A message in a request, snapshotted so the record stays readable if messages are pruned. */
export type OriginalMessage = {
  mid: string;
  text: string;
  attachments: Attachment[];
  sent_at: string;
};

export type ChangeRequest = {
  id: string;
  client_id: string | null;
  batch_id: string;
  classification: StoredClassification;
  confidence: number;
  original_messages: OriginalMessage[];
  summary: string;
  requested_changes: RequestedChange[];
  client_supplied_content: ClientSuppliedContent[];
  attachments_required: AttachmentRequirement[];
  ambiguities: Ambiguity[];
  clarification_required: string | null;
  lovable_prompt: string | null;
  status: RequestStatus;
  created_at: string;
  updated_at: string;
};

export type NewChangeRequest = Omit<ChangeRequest, 'id' | 'created_at' | 'updated_at'>;
