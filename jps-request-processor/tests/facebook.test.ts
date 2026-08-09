import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import { parseWebhookBody, verifySignature, verifySubscription } from '../src/services/facebook.ts';

const SECRET = 'test-app-secret';

function sign(body: string): string {
  return `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`;
}

test('a correctly signed body is accepted', () => {
  const body = JSON.stringify({ object: 'page', entry: [] });
  assert.equal(verifySignature(Buffer.from(body), sign(body), SECRET), true);
});

test('a tampered body is rejected', () => {
  const body = JSON.stringify({ object: 'page', entry: [] });
  const signature = sign(body);
  assert.equal(verifySignature(Buffer.from(`${body} `), signature, SECRET), false);
});

test('a missing, malformed or wrong-algorithm signature is rejected', () => {
  const body = Buffer.from('{}');
  assert.equal(verifySignature(body, undefined, SECRET), false);
  assert.equal(verifySignature(body, 'garbage', SECRET), false);
  assert.equal(verifySignature(body, 'sha1=abcdef', SECRET), false);
  assert.equal(verifySignature(body, 'sha256=nothex', SECRET), false);
});

test('the subscription handshake echoes the challenge only for the right token', () => {
  const query = { 'hub.mode': 'subscribe', 'hub.verify_token': 'right-token', 'hub.challenge': '12345' };
  assert.deepEqual(verifySubscription(query, 'right-token'), { ok: true, challenge: '12345' });
  assert.equal(verifySubscription(query, 'other-token').ok, false);
  assert.equal(verifySubscription({ ...query, 'hub.mode': 'unsubscribe' }, 'right-token').ok, false);
});

test('inbound text and attachments are extracted', () => {
  const messages = parseWebhookBody({
    object: 'page',
    entry: [
      {
        id: 'page-1',
        messaging: [
          {
            sender: { id: 'user-1' },
            recipient: { id: 'page-1' },
            timestamp: 1_700_000_000_000,
            message: {
              mid: 'mid.1',
              text: 'can you add commercial roofing',
              attachments: [{ type: 'image', payload: { url: 'https://cdn.example.com/a.jpg' } }],
            },
          },
        ],
      },
    ],
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.mid, 'mid.1');
  assert.equal(messages[0]?.senderId, 'user-1');
  assert.equal(messages[0]?.pageId, 'page-1');
  assert.equal(messages[0]?.text, 'can you add commercial roofing');
  assert.equal(messages[0]?.attachments[0]?.type, 'image');
  assert.equal(messages[0]?.sentAt, new Date(1_700_000_000_000).toISOString());
});

test('shared links arrive as link attachments', () => {
  const messages = parseWebhookBody({
    object: 'page',
    entry: [
      {
        id: 'page-1',
        messaging: [
          {
            sender: { id: 'user-1' },
            timestamp: 1,
            message: {
              mid: 'mid.2',
              text: 'like this one',
              attachments: [
                { type: 'fallback', title: 'Example Roofing', payload: { url: 'https://example.com' } },
              ],
            },
          },
        ],
      },
    ],
  });

  assert.equal(messages[0]?.attachments[0]?.type, 'link');
  assert.equal(messages[0]?.attachments[0]?.name, 'Example Roofing');
});

test('echoes, receipts and empty messages are ignored', () => {
  const messages = parseWebhookBody({
    object: 'page',
    entry: [
      {
        id: 'page-1',
        messaging: [
          // Our own reply, echoed back to us.
          { sender: { id: 'page-1' }, timestamp: 1, message: { mid: 'e1', text: 'hi', is_echo: true } },
          // Delivery receipt: no message payload at all.
          { sender: { id: 'user-1' }, timestamp: 2, delivery: { mids: ['mid.1'] } },
          // Message with neither text nor attachments.
          { sender: { id: 'user-1' }, timestamp: 3, message: { mid: 'e2' } },
        ],
      },
    ],
  });

  assert.equal(messages.length, 0);
});

test('a body that is not a page event yields nothing', () => {
  assert.deepEqual(parseWebhookBody({ object: 'instagram', entry: [] }), []);
  assert.deepEqual(parseWebhookBody('not json'), []);
  assert.deepEqual(parseWebhookBody(null), []);
});
