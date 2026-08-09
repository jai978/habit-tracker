import test from 'node:test';
import assert from 'node:assert/strict';

import { createHarness, fbMessage } from './helpers.ts';
import type { Analysis } from '../src/types/change-request.ts';

/** Behaviour around the acceptance tests: unknown senders, context, guardrails. */

test('an unrecognised sender is recorded, never guessed onto a client', async () => {
  const harness = await createHarness();
  await harness.addClient({ facebook_sender_id: 'sender-1', business_name: 'ABC Roofing' });

  await harness.processor.ingest([
    fbMessage({ senderId: 'sender-unknown', text: 'can you add commercial roofing' }),
  ]);
  await harness.closeDebounceWindow();
  await harness.processor.runDue();

  const [request] = await harness.store.changeRequests.list({ limit: 10 });
  assert.ok(request);
  assert.equal(request.classification, 'UNKNOWN_CLIENT');
  assert.equal(request.client_id, null);
  assert.equal(request.status, 'NEEDS_CLARIFICATION');
  assert.equal(harness.ai.calls.length, 0, 'an unknown sender is never sent to the model');
  assert.equal(harness.notifier.sent.length, 1, 'but JPS is still told about it');
});

test('linking the sender to a client and reprocessing produces a real request', async () => {
  const harness = await createHarness();
  const client = await harness.addClient({ facebook_sender_id: 'placeholder-id' });

  await harness.processor.ingest([
    fbMessage({ senderId: 'sender-unknown', text: 'can you add commercial roofing' }),
  ]);
  await harness.closeDebounceWindow();
  await harness.processor.runDue();

  const [unknown] = await harness.store.changeRequests.list({ limit: 10 });
  const batchId = unknown?.batch_id ?? '';

  // What the dashboard's "link and reprocess" action does.
  await harness.store.clients.update(client.id, { facebook_sender_id: 'sender-unknown' });
  await harness.store.batches.setClient(batchId, client.id);
  await harness.store.batches.requeue(batchId, new Date(Date.now() - 1000).toISOString());
  await harness.processor.runDue();

  const requests = await harness.store.changeRequests.list({ limit: 10 });
  assert.equal(requests.length, 2, 'the unknown-sender record is kept as history');
  assert.equal(requests[0]?.classification, 'CHANGE_REQUEST');
  assert.equal(requests[0]?.client_id, client.id);
});

test('a batch that already produced a request is not processed twice', async () => {
  const harness = await createHarness();
  await harness.addClient();

  await harness.processor.ingest([fbMessage({ text: 'can you add commercial roofing' })]);
  await harness.closeDebounceWindow();
  await harness.processor.runDue();

  const [request] = await harness.store.changeRequests.list({ limit: 10 });
  const batch = await harness.store.batches.getById(request?.batch_id ?? '');
  assert.ok(batch);

  // Simulate a retry of an already-completed batch.
  await harness.store.batches.requeue(batch.id, new Date(Date.now() - 1000).toISOString());
  await harness.processor.runDue();

  assert.equal((await harness.store.changeRequests.list({ limit: 10 })).length, 1);
  assert.equal(harness.ai.calls.length, 1);
});

test('earlier messages are offered as context but only the new burst is classified', async () => {
  const harness = await createHarness();
  await harness.addClient();

  await harness.processor.ingest([fbMessage({ mid: 'old', text: 'morning' })]);
  await harness.closeDebounceWindow();
  await harness.processor.runDue();

  await harness.processor.ingest([fbMessage({ mid: 'new', text: 'can you add commercial roofing' })]);
  await harness.closeDebounceWindow();
  await harness.processor.runDue();

  const secondCall = harness.ai.calls[1];
  assert.ok(secondCall);
  assert.equal(secondCall.batchMessages.length, 1);
  assert.equal(secondCall.batchMessages[0]?.mid, 'new');
  assert.equal(secondCall.recentMessages.length, 1);
  assert.equal(secondCall.recentMessages[0]?.mid, 'old');
  assert.equal(secondCall.recentRequests.length, 1, 'previous requests are available as context');
});

test('the site context and standing instructions reach the model', async () => {
  const harness = await createHarness();
  await harness.addClient({
    site_context: 'Pages: /, /services. Service pages share one layout.',
    special_instructions: 'Never change the booking form.',
  });

  await harness.processor.ingest([fbMessage({ text: 'can you add commercial roofing' })]);
  await harness.closeDebounceWindow();
  await harness.processor.runDue();

  const call = harness.ai.calls[0];
  assert.equal(call?.client?.site_context, 'Pages: /, /services. Service pages share one layout.');
  assert.equal(call?.client?.special_instructions, 'Never change the booking form.');
});

test('low confidence holds a change request for clarification', async () => {
  const harness = await createHarness({ CONFIDENCE_THRESHOLD: '0.9' });
  await harness.addClient();

  const unsure: Analysis = {
    classification: 'CHANGE_REQUEST',
    confidence: 0.55,
    summary: 'Possibly asking to move the gallery link.',
    requested_changes: [{ type: 'other', page: null, description: 'Move the gallery link.' }],
    client_supplied_content: [],
    attachments_required: [],
    ambiguities: [],
    clarification_required: null,
  };
  harness.ai.classify = async () => unsure;

  await harness.processor.ingest([fbMessage({ text: 'the gallery link' })]);
  await harness.closeDebounceWindow();
  await harness.processor.runDue();

  const [request] = await harness.store.changeRequests.list({ limit: 10 });
  assert.equal(request?.status, 'NEEDS_CLARIFICATION');
  assert.ok(request?.lovable_prompt, 'the prompt is still written, it just is not marked ready');
});

test('a change that needs a file the client never sent is held', async () => {
  const harness = await createHarness();
  await harness.addClient();

  harness.ai.classify = async () => ({
    classification: 'CHANGE_REQUEST',
    confidence: 0.95,
    summary: 'Replace the homepage photo with the one the client is sending.',
    requested_changes: [{ type: 'image_change', page: '/', description: 'Replace the homepage photo.' }],
    client_supplied_content: [],
    attachments_required: [{ type: 'image', purpose: 'replacement homepage photo', supplied: false }],
    ambiguities: [],
    clarification_required: null,
  });

  await harness.processor.ingest([fbMessage({ text: 'ill send the new photo shortly' })]);
  await harness.closeDebounceWindow();
  await harness.processor.runDue();

  const [request] = await harness.store.changeRequests.list({ limit: 10 });
  assert.equal(request?.status, 'NEEDS_CLARIFICATION');
  assert.match(request?.lovable_prompt ?? '', /do not invent a replacement/i);
});

test('a message arriving during processing starts a new batch', async () => {
  const harness = await createHarness();
  await harness.addClient();

  await harness.processor.ingest([fbMessage({ mid: 'first', text: 'can you add commercial roofing' })]);
  await harness.closeDebounceWindow();

  const claimed = await harness.store.batches.claimDue(new Date().toISOString(), 5);
  assert.equal(claimed.length, 1);

  // While that batch is claimed, another message arrives.
  await harness.processor.ingest([fbMessage({ mid: 'second', text: 'and remove Dave from about' })]);

  const open = await harness.store.batches.findOpenForSender('sender-1');
  assert.ok(open);
  assert.notEqual(open.id, claimed[0]?.id, 'the late message is not swallowed by the running batch');
  assert.equal((await harness.store.messages.listByBatch(open.id)).length, 1);
});
