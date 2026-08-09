import { loadConfig, type Config } from '../src/config.ts';
import { createSqliteStore } from '../src/db/sqlite-store.ts';
import type { Store } from '../src/db/store.ts';
import { createRequestProcessor, type RequestProcessor } from '../src/services/request-processor.ts';
import type { AiService } from '../src/services/ai.ts';
import type { Notifier } from '../src/services/notifications.ts';
import type { RequestContext } from '../src/services/client-context.ts';
import type { Analysis, ChangeRequest } from '../src/types/change-request.ts';
import type { Client } from '../src/types/client.ts';
import type { ParsedMessage } from '../src/services/facebook.ts';
import { createLogger, type Logger } from '../src/utils/logger.ts';
import { buildFallbackLovablePrompt } from '../src/prompts/generate-lovable-prompt.ts';

/** Test doubles and an in-memory pipeline, so the suite never calls a network. */

export const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  STORE_DRIVER: 'sqlite',
  SQLITE_PATH: ':memory:',
  ANTHROPIC_API_KEY: 'test-key',
  FB_VERIFY_TOKEN: 'test-verify-token',
  FB_APP_SECRET: 'test-app-secret',
  DASHBOARD_TOKEN: 'test-dashboard-token-0123456789',
  PUBLIC_URL: 'http://localhost:3000',
  MESSAGE_DEBOUNCE_MS: '10000',
  LOG_LEVEL: 'error',
};

export function testConfig(overrides: Record<string, string> = {}): Config {
  for (const [key, value] of Object.entries({ ...TEST_ENV, ...overrides })) {
    process.env[key] = value;
  }
  return loadConfig();
}

export function silentLogger(): Logger {
  return createLogger('error', {});
}

export type FakeAi = AiService & {
  /** Every classification call, in order. */
  calls: RequestContext[];
  /** Make the next N classification calls throw, to exercise the retry path. */
  failures: number;
};

/**
 * Stands in for the model with deterministic rules that mirror the behaviour
 * the real prompt asks for. The pipeline around it is the thing under test.
 */
export function createFakeAi(classify?: (context: RequestContext) => Analysis): FakeAi {
  const fake: FakeAi = {
    calls: [],
    failures: 0,

    async classify(context: RequestContext): Promise<Analysis> {
      fake.calls.push(context);
      if (fake.failures > 0) {
        fake.failures -= 1;
        throw new Error('AI API temporarily unavailable');
      }
      return classify ? classify(context) : scriptedClassify(context);
    },

    async generateLovablePrompt(client: Client | null, analysis: Analysis): Promise<string> {
      return buildFallbackLovablePrompt(client, analysis);
    },
  };
  return fake;
}

/** Rule-based classification good enough to drive the acceptance scenarios. */
export function scriptedClassify(context: RequestContext): Analysis {
  const text = context.batchMessages
    .map((message) => message.text)
    .join(' ')
    .toLowerCase();
  const attachments = context.batchMessages.flatMap((message) => message.attachments);

  const phone = /\b0\d[\d ]{7,}\b/.exec(context.batchMessages.map((message) => message.text).join(' '));

  if (phone) {
    return {
      classification: 'CHANGE_REQUEST',
      confidence: 0.97,
      summary: 'Change the displayed phone number.',
      requested_changes: [
        {
          type: 'contact_details',
          page: null,
          description: `Change the displayed phone number to ${phone[0].trim()} everywhere it appears.`,
        },
      ],
      client_supplied_content: [
        { kind: 'phone', value: phone[0].trim(), usage: 'the phone number shown across the site' },
      ],
      attachments_required: [],
      ambiguities: [],
      clarification_required: null,
    };
  }

  if (attachments.length > 0 && /(hero|photo|image|replace)/.test(text)) {
    return {
      classification: 'CHANGE_REQUEST',
      confidence: 0.93,
      summary: 'Replace the hero image with the image the client supplied.',
      requested_changes: [
        { type: 'image_change', page: '/', description: 'Replace the homepage hero image with the supplied image.' },
      ],
      client_supplied_content: [],
      attachments_required: [{ type: 'image', purpose: 'replacement hero image', supplied: true }],
      ambiguities: [],
      clarification_required: null,
    };
  }

  if (/(add|another service|commercial)/.test(text)) {
    return {
      classification: 'CHANGE_REQUEST',
      confidence: 0.95,
      summary: 'Add Commercial Roofing to the services page.',
      requested_changes: [
        {
          type: 'content_addition',
          page: '/services',
          description: 'Add Commercial Roofing alongside the existing services.',
        },
      ],
      client_supplied_content: [],
      attachments_required: [],
      ambiguities: [],
      clarification_required: null,
    };
  }

  if (/(don't|dont|do not) (really )?like|make .* better/.test(text)) {
    return {
      classification: 'POSSIBLE_CHANGE',
      confidence: 0.7,
      summary: 'Client is unhappy with the homepage but has not said what should change.',
      requested_changes: [],
      client_supplied_content: [],
      attachments_required: [],
      ambiguities: [
        {
          question: 'Which part of the homepage do you want changed, and what should it become?',
          why: 'Dissatisfaction was expressed without naming an element or a replacement.',
        },
      ],
      clarification_required: 'Ask which elements of the homepage they want changed.',
    };
  }

  return {
    classification: 'OTHER',
    confidence: 0.98,
    summary: 'General conversation, no website change requested.',
    requested_changes: [],
    client_supplied_content: [],
    attachments_required: [],
    ambiguities: [],
    clarification_required: null,
  };
}

export type RecordingNotifier = Notifier & {
  sent: { request: ChangeRequest; client: Client | null }[];
  failures: { batchId: string; error: string }[];
};

export function createRecordingNotifier(): RecordingNotifier {
  const notifier: RecordingNotifier = {
    sent: [],
    failures: [],
    async requestCreated(request, client) {
      notifier.sent.push({ request, client });
    },
    async processingFailed(batchId, _senderId, error) {
      notifier.failures.push({ batchId, error });
    },
  };
  return notifier;
}

export type Harness = {
  config: Config;
  store: Store;
  ai: FakeAi;
  notifier: RecordingNotifier;
  processor: RequestProcessor;
  /** Pretend the debounce window has closed for every open batch. */
  closeDebounceWindow(): Promise<void>;
  addClient(overrides?: Partial<Client>): Promise<Client>;
};

export async function createHarness(envOverrides: Record<string, string> = {}): Promise<Harness> {
  const config = testConfig(envOverrides);
  const store = createSqliteStore(':memory:');
  await store.migrate();

  const ai = createFakeAi();
  const notifier = createRecordingNotifier();
  const logger = silentLogger();
  const processor = createRequestProcessor({ config, store, ai, notifier, logger });

  return {
    config,
    store,
    ai,
    notifier,
    processor,
    async closeDebounceWindow() {
      // Move each open batch's deadline into the past instead of sleeping for a
      // real debounce window. This is the only place tests skip wall-clock time.
      const past = new Date(Date.now() - 1000).toISOString();
      for (const sender of KNOWN_SENDERS) {
        const batch = await store.batches.findOpenForSender(sender);
        if (batch) await store.batches.extend(batch.id, past);
      }
    },
    async addClient(overrides: Partial<Client> = {}) {
      return store.clients.create({
        business_name: overrides.business_name ?? 'ABC Roofing',
        facebook_sender_id: overrides.facebook_sender_id ?? 'sender-1',
        website_url: overrides.website_url ?? 'https://abcroofing.co.nz',
        lovable_project_reference: overrides.lovable_project_reference ?? 'abc-roofing',
        site_context:
          overrides.site_context ??
          'Pages: /, /about, /services, /services/residential-roofing, /gallery, /contact. Preserve branding and forms.',
        special_instructions: overrides.special_instructions ?? null,
      });
    },
  };
}

/** Senders used across the test suite; keeps closeDebounceWindow simple. */
export const KNOWN_SENDERS = ['sender-1', 'sender-2', 'sender-unknown'];

export function fbMessage(overrides: Partial<ParsedMessage> = {}): ParsedMessage {
  return {
    mid: overrides.mid ?? `mid-${Math.random().toString(36).slice(2)}`,
    senderId: overrides.senderId ?? 'sender-1',
    pageId: overrides.pageId ?? 'page-1',
    text: overrides.text ?? 'hello',
    attachments: overrides.attachments ?? [],
    sentAt: overrides.sentAt ?? new Date().toISOString(),
  };
}
