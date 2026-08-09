import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTelegramSummary, shouldNotify } from '../src/services/notifications.ts';
import { testConfig } from './helpers.ts';
import type { ChangeRequest } from '../src/types/change-request.ts';

function request(overrides: Partial<ChangeRequest> = {}): ChangeRequest {
  return {
    id: 'request-1',
    client_id: 'client-1',
    batch_id: 'batch-1',
    classification: 'CHANGE_REQUEST',
    confidence: 0.97,
    original_messages: [
      { mid: 'm1', text: 'Hey mate can you add commercial roofing', attachments: [], sent_at: '2026-08-01T09:00:00.000Z' },
    ],
    summary: 'Add Commercial Roofing to Services.',
    requested_changes: [
      { type: 'content_addition', page: '/services', description: 'Add Commercial Roofing as a service.' },
    ],
    client_supplied_content: [],
    attachments_required: [],
    ambiguities: [],
    clarification_required: null,
    lovable_prompt: 'Update the existing ABC Roofing website.',
    status: 'NEW',
    created_at: '2026-08-01T09:01:00.000Z',
    updated_at: '2026-08-01T09:01:00.000Z',
    ...overrides,
  };
}

test('conversation that asked for nothing is never announced', () => {
  const config = testConfig();
  assert.equal(shouldNotify(request({ classification: 'OTHER' }), config), false);
  assert.equal(shouldNotify(request(), config), true);
  assert.equal(shouldNotify(request({ classification: 'UNKNOWN_CLIENT' }), config), true);
});

test('possible changes can be muted without muting real requests', () => {
  const muted = testConfig({ NOTIFY_POSSIBLE_CHANGE: 'false' });
  assert.equal(shouldNotify(request({ classification: 'POSSIBLE_CHANGE' }), muted), false);
  assert.equal(shouldNotify(request(), muted), true);

  const loud = testConfig({ NOTIFY_POSSIBLE_CHANGE: 'true' });
  assert.equal(shouldNotify(request({ classification: 'POSSIBLE_CHANGE' }), loud), true);
});

test('the alert carries the client, the ask and a dashboard link', () => {
  const summary = buildTelegramSummary(
    request(),
    {
      id: 'client-1',
      business_name: 'ABC Roofing',
      facebook_sender_id: 'sender-1',
      facebook_page_id: null,
      website_url: null,
      lovable_project_reference: null,
      site_context: null,
      special_instructions: null,
      active: true,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    'https://jps.example.com/dashboard/requests/request-1',
  );

  assert.match(summary, /WEBSITE CHANGE/);
  assert.match(summary, /ABC Roofing/);
  assert.match(summary, /97%/);
  assert.match(summary, /Hey mate can you add commercial roofing/);
  assert.match(summary, /dashboard\/requests\/request-1/);
});

test('client text cannot inject markup into the alert', () => {
  const hostile = request({
    summary: '<b>not bold</b> & <a href="https://evil.example">link</a>',
  });
  const summary = buildTelegramSummary(hostile, null, 'https://jps.example.com/dashboard');

  assert.ok(!summary.includes('<b>not bold</b>'));
  assert.match(summary, /&lt;b&gt;not bold&lt;\/b&gt; &amp; /);
});

test('an oversized alert is truncated to Telegram\'s limit', () => {
  const huge = request({ summary: 'x'.repeat(9000) });
  assert.ok(buildTelegramSummary(huge, null, 'https://jps.example.com/dashboard').length <= 4096);
});
