import express, { type Express, type Request } from 'express';

import type { Config } from './config.ts';
import type { Store } from './db/index.ts';
import type { RequestProcessor } from './services/request-processor.ts';
import { createFacebookWebhookRouter } from './api/facebook-webhook.ts';
import { createDashboardRouter } from './api/dashboard.ts';
import { EVENTS, errorMessage, type Logger } from './utils/logger.ts';

export function createServer(deps: {
  config: Config;
  store: Store;
  processor: RequestProcessor;
  logger: Logger;
}): Express {
  const { config, store, processor, logger } = deps;
  const app = express();

  app.disable('x-powered-by');
  // Behind a single reverse proxy (Fly, Render, Railway, nginx), so req.ip and
  // req.protocol come from the first forwarded hop.
  app.set('trust proxy', 1);

  app.use(
    express.json({
      limit: '1mb',
      // Keep the exact bytes: the webhook signature covers the raw body, and a
      // re-serialised copy will not match.
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
      },
    }),
  );
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'jps-request-processor', time: new Date().toISOString() });
  });

  app.use('/webhooks/facebook', createFacebookWebhookRouter({ config, store, processor, logger }));

  if (config.dashboard.enabled) {
    app.use('/dashboard', createDashboardRouter({ config, store, logger }));
    app.get('/', (_req, res) => res.redirect('/dashboard'));
  }

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((error: unknown, _req: Request, res: express.Response, _next: express.NextFunction) => {
    logger.error(EVENTS.error, { stage: 'http', reason: errorMessage(error) });
    if (!res.headersSent) res.status(500).json({ error: 'Internal error' });
  });

  return app;
}
