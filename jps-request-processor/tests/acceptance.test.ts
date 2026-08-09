import test from 'node:test';
import assert from 'node:assert/strict';

import { createHarness, fbMessage } from './helpers.ts';
import { shouldNotify } from '../src/services/notifications.ts';

/**
 * The MVP acceptance tests from the PRD, run end to end through the real
 * pipeline (storage, buffering, retry, status rules) with a scripted model.
 */

test('Test 1 — a thank-you message produces no Lovable prompt', async () => {
  const harness = await createHarness();
  await harness.addClient();

  await harness.processor.ingest([fbMessage({ text: 'Thanks mate website looks awesome' })]);
  await harness.closeDebounceWindow();
  await harness.processor.runDue();

  const requests = await harness.store.changeRequests.list({ limit: 10 });
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.classification, 'OTHER');
  assert.equal(requests[0]?.lovable_prompt, null);
  assert.equal(requests[0]?.status, 'IGNORED');
  // Recorded for the history, but never announced to the operator.
  assert.equal(shouldNotify(requests[0]!, harness.config), false);
});

test('Test 2 — a phone number change produces a prompt naming the new number', async () => {
  const harness = await createHarness();
  await harness.addClient();

  await harness.processor.ingest([fbMessage({ text: 'Can you change the phone number to 021 123 4567' })]);
  await harness.closeDebounceWindow();
  await harness.processor.runDue();

  const [request] = await harness.store.changeRequests.list({ limit: 10 });
  assert.ok(request);
  assert.equal(request.classification, 'CHANGE_REQUEST');
  assert.equal(request.status, 'NEW');
  assert.ok(request.lovable_prompt, 'a prompt should have been generated');
  assert.match(request.lovable_prompt ?? '', /021 123 4567/);
  assert.match(request.lovable_prompt ?? '', /SCOPE CONTROL/);
  assert.match(request.lovable_prompt ?? '', /VALIDATION/);
  assert.equal(harness.notifier.sent.length, 1);
});

test('Test 3 — four rapid messages become one consolidated request', async () => {
  const harness = await createHarness();
  await harness.addClient();

  await harness.processor.ingest([
    fbMessage({ mid: 'm1', text: 'hey' }),
    fbMessage({ mid: 'm2', text: 'can you add another service' }),
    fbMessage({ mid: 'm3', text: 'commercial roofing' }),
    fbMessage({ mid: 'm4', text: 'put it with the other services' }),
  ]);

  // Still inside the debounce window: nothing should be processed yet.
  assert.equal(await harness.processor.runDue(), 0);
  assert.equal((await harness.store.changeRequests.list({ limit: 10 })).length, 0);

  await harness.closeDebounceWindow();
  assert.equal(await harness.processor.runDue(), 1);

  const requests = await harness.store.changeRequests.list({ limit: 10 });
  assert.equal(requests.length, 1, 'one request, not four');
  assert.equal(requests[0]?.classification, 'CHANGE_REQUEST');
  assert.equal(requests[0]?.original_messages.length, 4);
  assert.equal(harness.ai.calls.length, 1, 'the model is called once for the whole burst');
});

test('Test 4 — vague dissatisfaction is escalated, not guessed at', async () => {
  const harness = await createHarness();
  await harness.addClient();

  await harness.processor.ingest([fbMessage({ text: "I don't really like the homepage" })]);
  await harness.closeDebounceWindow();
  await harness.processor.runDue();

  const [request] = await harness.store.changeRequests.list({ limit: 10 });
  assert.ok(request);
  assert.equal(request.classification, 'POSSIBLE_CHANGE');
  assert.equal(request.status, 'NEEDS_CLARIFICATION');
  assert.equal(request.lovable_prompt, null, 'no implementation prompt while the ask is unclear');
  assert.ok(request.ambiguities.length > 0);
  assert.ok(request.clarification_required);
});

test('Test 5 — an attached image is carried into the request', async () => {
  const harness = await createHarness();
  await harness.addClient();

  await harness.processor.ingest([
    fbMessage({
      text: 'Replace the hero image with this',
      attachments: [{ type: 'image', url: 'https://cdn.example.com/hero.jpg', name: null }],
    }),
  ]);
  await harness.closeDebounceWindow();
  await harness.processor.runDue();

  const [request] = await harness.store.changeRequests.list({ limit: 10 });
  assert.ok(request);
  assert.equal(request.classification, 'CHANGE_REQUEST');
  assert.equal(request.original_messages[0]?.attachments[0]?.type, 'image');
  assert.equal(request.attachments_required[0]?.supplied, true);
  assert.match(request.lovable_prompt ?? '', /client-supplied image/i);
});

test('Test 6 — an AI failure keeps the messages and stays retryable', async () => {
  const harness = await createHarness();
  await harness.addClient();

  harness.ai.failures = 1;
  await harness.processor.ingest([fbMessage({ mid: 'm1', text: 'can you add commercial roofing' })]);
  await harness.closeDebounceWindow();
  await harness.processor.runDue();

  assert.equal((await harness.store.changeRequests.list({ limit: 10 })).length, 0);

  const batch = await harness.store.batches.findOpenForSender('sender-1');
  assert.ok(batch, 'the batch is queued again rather than dropped');
  assert.equal(batch.attempts, 1);
  assert.match(batch.last_error ?? '', /temporarily unavailable/);
  assert.equal((await harness.store.messages.listByBatch(batch.id)).length, 1, 'the message is still stored');

  // Second attempt, with the AI back.
  await harness.closeDebounceWindow();
  await harness.processor.runDue();

  const requests = await harness.store.changeRequests.list({ limit: 10 });
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.classification, 'CHANGE_REQUEST');
});

test('Test 6b — a batch that exhausts its retries is parked and reported', async () => {
  const harness = await createHarness({ MAX_PROCESSING_ATTEMPTS: '2' });
  await harness.addClient();

  harness.ai.failures = 5;
  await harness.processor.ingest([fbMessage({ text: 'can you add commercial roofing' })]);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await harness.closeDebounceWindow();
    await harness.processor.runDue();
  }

  const failed = await harness.store.batches.listFailed(10);
  assert.equal(failed.length, 1);
  assert.equal(failed[0]?.attempts, 2);
  assert.equal(harness.notifier.failures.length, 1, 'JPS is told when a batch gives up');

  // The operator can retry it from the dashboard, and it succeeds once the AI recovers.
  harness.ai.failures = 0;
  await harness.store.batches.requeue(failed[0]?.id ?? '', new Date(Date.now() - 1000).toISOString());
  await harness.processor.runDue();
  assert.equal((await harness.store.changeRequests.list({ limit: 10 })).length, 1);
});

test('Test 7 — a duplicated webhook event creates one message and one request', async () => {
  const harness = await createHarness();
  await harness.addClient();

  const delivery = [fbMessage({ mid: 'mid.duplicate', text: 'can you add commercial roofing' })];

  const first = await harness.processor.ingest(delivery);
  const second = await harness.processor.ingest(delivery);

  assert.deepEqual(first, { stored: 1, duplicates: 0 });
  assert.deepEqual(second, { stored: 0, duplicates: 1 });

  await harness.closeDebounceWindow();
  await harness.processor.runDue();

  const requests = await harness.store.changeRequests.list({ limit: 10 });
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.original_messages.length, 1);
});
