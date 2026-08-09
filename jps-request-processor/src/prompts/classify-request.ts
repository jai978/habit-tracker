import type { RequestContext } from '../services/client-context.ts';
import type { Attachment, Message } from '../types/message.ts';
import type { ChangeRequest } from '../types/change-request.ts';

/**
 * Prompt and output schema for the classification step.
 *
 * Kept free of application logic on purpose: this file decides what the model
 * is told and what shape it must answer in, nothing else.
 */

export const ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'classification',
    'confidence',
    'summary',
    'requested_changes',
    'client_supplied_content',
    'attachments_required',
    'ambiguities',
    'clarification_required',
  ],
  properties: {
    classification: {
      type: 'string',
      enum: ['CHANGE_REQUEST', 'POSSIBLE_CHANGE', 'OTHER'],
      description: 'CHANGE_REQUEST only when the client clearly asked for a specific website change.',
    },
    confidence: {
      type: 'number',
      description: 'How confident you are in the classification, from 0 to 1.',
    },
    summary: {
      type: 'string',
      description: 'One or two sentences describing what the client asked for, in plain language.',
    },
    requested_changes: {
      type: 'array',
      description: 'One entry per distinct change the client actually asked for. Empty unless CHANGE_REQUEST.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'page', 'description'],
        properties: {
          type: {
            type: 'string',
            enum: [
              'content_addition',
              'content_edit',
              'content_removal',
              'image_change',
              'contact_details',
              'layout_or_styling',
              'new_page',
              'seo',
              'other',
            ],
          },
          page: {
            anyOf: [{ type: 'string' }, { type: 'null' }],
            description: 'The page the client named, using the site context paths where they match. Null if unstated.',
          },
          description: {
            type: 'string',
            description: 'The change, stated as an instruction. No detail the client did not give.',
          },
        },
      },
    },
    client_supplied_content: {
      type: 'array',
      description: 'Exact values the client provided that must appear on the site verbatim.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'value', 'usage'],
        properties: {
          kind: {
            type: 'string',
            enum: ['text', 'phone', 'email', 'address', 'url', 'hours', 'other'],
          },
          value: { type: 'string', description: 'Copied exactly as the client wrote it.' },
          usage: { type: 'string', description: 'Where this value should be used.' },
        },
      },
    },
    attachments_required: {
      type: 'array',
      description: 'Files the change depends on, whether or not the client has sent them yet.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'purpose', 'supplied'],
        properties: {
          type: { type: 'string', enum: ['image', 'document', 'video', 'link', 'other'] },
          purpose: { type: 'string', description: 'What the file is for, e.g. "replacement homepage hero image".' },
          supplied: { type: 'boolean', description: 'True if the client attached it to these messages.' },
        },
      },
    },
    ambiguities: {
      type: 'array',
      description: 'Things a person would have to ask the client before this could be implemented safely.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['question', 'why'],
        properties: {
          question: { type: 'string', description: 'The question to put to the client.' },
          why: { type: 'string', description: 'What is unclear and what could go wrong if it is guessed.' },
        },
      },
    },
    clarification_required: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'For POSSIBLE_CHANGE, a short note on what JPS needs to find out. Null otherwise.',
    },
  },
} as const;

export const CLASSIFY_SYSTEM_PROMPT = `You read messages that clients of JPS Solutions send to its Facebook Page, and you work out whether the client is asking for a change to their website.

You are an interpreter, not a decision maker. A JPS operator reviews everything you produce before any site is touched. A missed request costs them a few minutes; a misread request can damage a client's live website, so when the two risks compete, prefer to flag rather than guess.

## Classification

CHANGE_REQUEST — the client clearly wants something on their website changed, and the intended action is identifiable.
  "Change our phone number to 021 123 4567" / "Can you add commercial roofing to our services" /
  "Remove John from the About page" / "Use this photo on the homepage" (with an image attached)

POSSIBLE_CHANGE — something on the site may need to change, but what to do about it is not determined.
  "I don't really like the photo on the homepage" — dissatisfaction, no instruction.
  "Can you make the homepage better?" — a goal, not a change.
  Also use this when a request is clear in intent but missing something essential, such as an image the
  client says they are sending but has not sent, or a value they have not supplied yet.

OTHER — no website change is being asked for. Thanks, small talk, payment and scheduling questions,
  compliments, questions about how something works.

## Rules

Interpret; never invent. Every entry in requested_changes must trace back to something the client actually
wrote. If they asked to change a phone number, that is the whole job — do not also improve the contact
section, tidy the layout, or add anything they did not mention.

Keep their words. Phone numbers, email addresses, street addresses, opening hours, URLs and any wording
they want on the site go into client_supplied_content exactly as they typed them, including capitalisation.
Never reformat, correct or complete a value they supplied.

One conversation, one request. If they ask for three unrelated things in the same burst of messages, that
is one CHANGE_REQUEST with three entries in requested_changes.

Read the whole conversation. Earlier messages are there to resolve references like "the photo I sent" or
"the one near the services". Do not treat an earlier message as a new request — only the messages in
CURRENT MESSAGES are being asked about now.

Attachments. If the client attached an image or file, say what it is for in attachments_required with
supplied=true. If they refer to a file they have not sent, record it with supplied=false and raise an
ambiguity, because the change cannot be implemented without it.

Ambiguity is information, not failure. Record anything a careful person would need to ask, even when you
are confident enough overall to classify it as a CHANGE_REQUEST. If the ambiguity is severe enough that
implementing the request would mean guessing at what the client wants, classify it POSSIBLE_CHANGE instead.

Confidence should reflect the classification only, not how easy the change is to make.`;

function formatAttachments(attachments: Attachment[]): string {
  if (attachments.length === 0) return '';
  const parts = attachments.map((attachment) => {
    const name = attachment.name ? ` "${attachment.name}"` : '';
    return `[attached ${attachment.type}${name}]`;
  });
  return ` ${parts.join(' ')}`;
}

function formatMessages(messages: Message[]): string {
  if (messages.length === 0) return '(none)';
  return messages
    .map((message) => {
      const time = message.sent_at.replace('T', ' ').slice(0, 19);
      const body = message.text.trim() === '' ? '(no text)' : message.text.trim();
      return `[${time}] ${body}${formatAttachments(message.attachments)}`;
    })
    .join('\n');
}

function formatPreviousRequests(requests: ChangeRequest[]): string {
  if (requests.length === 0) return '(none)';
  return requests
    .map((request) => {
      const date = request.created_at.slice(0, 10);
      return `- ${date} [${request.classification} / ${request.status}] ${request.summary}`;
    })
    .join('\n');
}

/** Build the user turn: client identity, site context, history, then the messages under analysis. */
export function buildClassifyInput(context: RequestContext): string {
  const { client } = context;

  const sections: string[] = [];

  sections.push(
    [
      'CLIENT',
      client ? `Business: ${client.business_name}` : 'Business: (sender not matched to a client)',
      client?.website_url ? `Website: ${client.website_url}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
  );

  sections.push(`SITE CONTEXT\n${client?.site_context?.trim() || '(none recorded)'}`);

  if (client?.special_instructions?.trim()) {
    sections.push(
      `STANDING INSTRUCTIONS FROM JPS\nThese constrain what may be requested for this client.\n${client.special_instructions.trim()}`,
    );
  }

  sections.push(`PREVIOUS WEBSITE REQUESTS\n${formatPreviousRequests(context.recentRequests)}`);

  sections.push(
    `EARLIER CONVERSATION (context only — do not treat as a new request)\n${formatMessages(context.recentMessages)}`,
  );

  sections.push(`CURRENT MESSAGES (this is what you are classifying)\n${formatMessages(context.batchMessages)}`);

  return sections.join('\n\n');
}
