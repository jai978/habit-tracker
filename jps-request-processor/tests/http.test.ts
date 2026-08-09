import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import type { AddressInfo } from 'node:net';

import { createServer } from '../src/server.ts';
import { createHarness, silentLogger, TEST_ENV } from './helpers.ts';

/** The HTTP surface: signature enforcement, the Meta handshake, dashboard auth. */

async function withServer(
  run: (base: string, harness: Awaited<ReturnType<typeof createHarness>>) => Promise<void>,
  env: Record<string, string> = {},
): Promise<void> {
  const harness = await createHarness(env);
  const app = createServer({
    config: harness.config,
    store: harness.store,
    processor: harness.processor,
    logger: silentLogger(),
  });

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;

  try {
    await run(`http://127.0.0.1:${port}`, harness);
  } finally {
    server.close();
    await harness.store.close();
  }
}

function signedPost(base: string, body: unknown, secret = TEST_ENV.FB_APP_SECRET ?? ''): Promise<Response> {
  const payload = JSON.stringify(body);
  return fetch(`${base}/webhooks/facebook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`,
    },
    body: payload,
  });
}

const DELIVERY = {
  object: 'page',
  entry: [
    {
      id: 'page-1',
      messaging: [
        {
          sender: { id: 'sender-1' },
          timestamp: Date.now(),
          message: { mid: 'mid.http.1', text: 'can you add commercial roofing' },
        },
      ],
    },
  ],
};

test('health responds without authentication', async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/health`);
    assert.equal(response.status, 200);
    assert.equal(((await response.json()) as { ok: boolean }).ok, true);
  });
});

test('the webhook rejects an unsigned or wrongly signed delivery', async () => {
  await withServer(async (base, harness) => {
    const unsigned = await fetch(`${base}/webhooks/facebook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(DELIVERY),
    });
    assert.equal(unsigned.status, 403);

    const wrong = await signedPost(base, DELIVERY, 'not-the-app-secret');
    assert.equal(wrong.status, 403);

    // Nothing was stored by either attempt.
    assert.equal(await harness.store.batches.findOpenForSender('sender-1'), null);
  });
});

test('a signed delivery is accepted and stored', async () => {
  await withServer(async (base, harness) => {
    await harness.addClient();

    const response = await signedPost(base, DELIVERY);
    assert.equal(response.status, 200);

    // The webhook acknowledges before ingesting; give the async work a tick.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const batch = await harness.store.batches.findOpenForSender('sender-1');
    assert.ok(batch, 'a batch was opened for the sender');
    assert.equal((await harness.store.messages.listByBatch(batch.id)).length, 1);
  });
});

test('the Meta subscription handshake echoes the challenge', async () => {
  await withServer(async (base) => {
    const ok = await fetch(
      `${base}/webhooks/facebook?hub.mode=subscribe&hub.verify_token=${TEST_ENV.FB_VERIFY_TOKEN}&hub.challenge=abc123`,
    );
    assert.equal(ok.status, 200);
    assert.equal(await ok.text(), 'abc123');

    const bad = await fetch(
      `${base}/webhooks/facebook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123`,
    );
    assert.equal(bad.status, 403);
  });
});

test('the dashboard requires the token, and sets a cookie once given it', async () => {
  await withServer(async (base) => {
    const anonymous = await fetch(`${base}/dashboard`, { redirect: 'manual' });
    assert.equal(anonymous.status, 401);

    const authorised = await fetch(`${base}/dashboard?token=${TEST_ENV.DASHBOARD_TOKEN}`);
    assert.equal(authorised.status, 200);
    assert.match(authorised.headers.get('set-cookie') ?? '', /jps_dashboard=/);
    assert.match(authorised.headers.get('set-cookie') ?? '', /SameSite=Strict/i);
    assert.match(await authorised.text(), /Requests/);
  });
});

test('a cookie alone cannot drive a state change without the form token', async () => {
  await withServer(async (base, harness) => {
    await harness.addClient();
    await harness.processor.ingest([
      {
        mid: 'mid.csrf',
        senderId: 'sender-1',
        pageId: 'page-1',
        text: 'can you add commercial roofing',
        attachments: [],
        sentAt: new Date().toISOString(),
      },
    ]);
    await harness.closeDebounceWindow();
    await harness.processor.runDue();
    const [request] = await harness.store.changeRequests.list({ limit: 1 });
    assert.ok(request);

    const forged = await fetch(`${base}/dashboard/requests/${request.id}/status`, {
      method: 'POST',
      headers: {
        cookie: `jps_dashboard=${TEST_ENV.DASHBOARD_TOKEN}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'status=IMPLEMENTED',
      redirect: 'manual',
    });
    assert.equal(forged.status, 403);

    const unchanged = await harness.store.changeRequests.getById(request.id);
    assert.equal(unchanged?.status, 'NEW');
  });
});

test('message text is escaped on the dashboard', async () => {
  await withServer(async (base, harness) => {
    await harness.addClient({ business_name: '<script>alert(1)</script>' });
    await harness.processor.ingest([
      {
        mid: 'mid.xss',
        senderId: 'sender-1',
        pageId: 'page-1',
        text: 'add commercial roofing <img src=x onerror=alert(1)>',
        attachments: [],
        sentAt: new Date().toISOString(),
      },
    ]);
    await harness.closeDebounceWindow();
    await harness.processor.runDue();
    const [request] = await harness.store.changeRequests.list({ limit: 1 });

    const page = await fetch(`${base}/dashboard/requests/${request?.id}?token=${TEST_ENV.DASHBOARD_TOKEN}`);
    const html = await page.text();

    assert.ok(!html.includes('<img src=x'), 'attacker markup must not be rendered as markup');
    assert.ok(!html.includes('<script>alert(1)</script>'), 'a hostile business name must not be rendered');
    assert.match(html, /&lt;img src=x/);
  });
});
