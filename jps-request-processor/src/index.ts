import { existsSync } from 'node:fs';

import { assertRunnable, loadConfig } from './config.ts';
import { createStore } from './db/index.ts';
import { createAiService } from './services/ai.ts';
import { createNotifier } from './services/notifications.ts';
import { createRequestProcessor } from './services/request-processor.ts';
import { createScheduler } from './services/scheduler.ts';
import { createServer } from './server.ts';
import { createLogger, EVENTS, errorMessage } from './utils/logger.ts';

// Node reads .env natively; no dotenv dependency. Production hosts set real
// environment variables and simply have no file here.
if (existsSync('.env')) process.loadEnvFile('.env');

const config = loadConfig();
const logger = createLogger(config.logLevel, { service: 'jps-request-processor' });

async function main(): Promise<void> {
  assertRunnable(config);

  const store = createStore(config);
  await store.migrate();

  const ai = createAiService(config, logger);
  const notifier = createNotifier(config, logger);
  const processor = createRequestProcessor({ config, store, ai, notifier, logger });
  const scheduler = createScheduler({ config, store, processor, logger });

  const app = createServer({ config, store, processor, logger });
  const server = app.listen(config.port, () => {
    logger.info('server_started', {
      port: config.port,
      store: config.store.driver,
      model: config.ai.model,
      dashboard: config.dashboard.enabled ? `${config.publicUrl}/dashboard` : 'disabled',
    });
  });

  scheduler.start();

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('shutdown_started', { signal });

    // Stop accepting new work, let the current batch finish, then release the
    // database. A batch interrupted mid-flight stays claimed and is picked up
    // again after its retry delay.
    server.close();
    await scheduler.stop();
    await store.close();
    logger.info('shutdown_complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error(EVENTS.error, { stage: 'unhandled_rejection', reason: errorMessage(reason) });
  });
}

main().catch((error: unknown) => {
  logger.error(EVENTS.error, { stage: 'startup', reason: errorMessage(error) });
  process.exit(1);
});
