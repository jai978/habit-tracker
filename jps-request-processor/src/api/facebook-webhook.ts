import { Router, type Request } from 'express';

import type { Config } from '../config.ts';
import type { Store } from '../db/index.ts';
import type { RequestProcessor } from '../services/request-processor.ts';
import { parseWebhookBody, verifySignature, verifySubscription } from '../services/facebook.ts';
import { EVENTS, errorMessage, type Logger } from '../utils/logger.ts';
import { rateLimit } from '../utils/rate-limit.ts';
import { sha256 } from '../utils/ids.ts';

/** express.json({ verify }) stashes the exact bytes here for signature checking. */
type RawBodyRequest = Request & { rawBody?: Buffer };

export function createFacebookWebhookRouter(deps: {
  config: Config;
  store: Store;
  processor: RequestProcessor;
  logger: Logger;
}): Router {
  const { config, store, processor, logger } = deps;
  const router = Router();

  router.use(rateLimit({ windowMs: 60_000, max: 600 }));

  // Meta's subscription handshake.
  router.get('/', (req, res) => {
    if (!config.facebook.verifyToken) {
      res.status(500).send('FB_VERIFY_TOKEN is not configured');
      return;
    }
    const result = verifySubscription(req.query as Record<string, unknown>, config.facebook.verifyToken);
    if (!result.ok) {
      logger.warn(EVENTS.webhookRejected, { stage: 'subscribe', reason: result.reason });
      res.sendStatus(403);
      return;
    }
    logger.info('webhook_subscribed');
    res.status(200).send(result.challenge);
  });

  router.post('/', async (req, res) => {
    const rawBody = (req as RawBodyRequest).rawBody ?? Buffer.alloc(0);

    if (config.facebook.requireSignature) {
      const signature = req.get('x-hub-signature-256');
      if (!config.facebook.appSecret || !verifySignature(rawBody, signature, config.facebook.appSecret)) {
        logger.warn(EVENTS.webhookRejected, { stage: 'signature', ip: req.ip });
        res.sendStatus(403);
        return;
      }
    }

    // Meta retries anything that is not answered quickly, and retrying a slow
    // success is worse than answering before the work is done — the messages are
    // already durable by the time this returns, and the scheduler does the rest.
    res.sendStatus(200);

    try {
      const messages = parseWebhookBody(req.body);
      logger.info(EVENTS.webhookReceived, { messages: messages.length });

      // Ingest first. Deduplication happens on Facebook's message id inside a
      // single insert, so a retry is safe — whereas gating on the raw payload
      // before ingesting would drop the retry of a delivery that failed midway.
      if (messages.length > 0) {
        const result = await processor.ingest(messages);
        logger.info('webhook_ingested', result);
      }

      // Kept for debugging only; a repeat delivery is expected, not an error.
      const body = rawBody.toString('utf8');
      const isNewDelivery = await store.rawEvents.record(sha256(body), body);
      if (!isNewDelivery) logger.info(EVENTS.webhookDuplicate, { messages: messages.length });
    } catch (error) {
      logger.error(EVENTS.error, { stage: 'webhook', reason: errorMessage(error) });
    }
  });

  return router;
}
