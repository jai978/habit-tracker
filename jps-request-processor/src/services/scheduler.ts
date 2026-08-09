import type { Config } from '../config.ts';
import type { Store } from '../db/index.ts';
import type { RequestProcessor } from './request-processor.ts';
import { EVENTS, errorMessage, type Logger } from '../utils/logger.ts';

/**
 * Drives the debounce.
 *
 * A poll loop rather than in-memory timers: a timer dies with the process and
 * takes the pending batch with it, whereas the deadline lives in the database
 * and is picked up again after a restart or a deploy.
 */
export type Scheduler = {
  start(): void;
  stop(): Promise<void>;
};

const PRUNE_INTERVAL_MS = 60 * 60 * 1000;
const RAW_EVENT_RETENTION_DAYS = 14;

export function createScheduler(deps: {
  config: Config;
  store: Store;
  processor: RequestProcessor;
  logger: Logger;
}): Scheduler {
  const { config, store, processor, logger } = deps;

  let timer: NodeJS.Timeout | null = null;
  let pruneTimer: NodeJS.Timeout | null = null;
  let running = false;
  let stopped = false;
  /** Resolves once an in-flight tick finishes, so shutdown can wait for it. */
  let inFlight: Promise<void> = Promise.resolve();

  async function tick(): Promise<void> {
    // Ticks never overlap: a slow AI call must not cause a second pass over the
    // same queue while the first is still claiming batches.
    if (running || stopped) return;
    running = true;
    try {
      const processed = await processor.runDue();
      if (processed > 0) logger.debug('scheduler_tick', { processed });
    } catch (error) {
      logger.error(EVENTS.error, { stage: 'scheduler_tick', reason: errorMessage(error) });
    } finally {
      running = false;
    }
  }

  /**
   * A batch is claimed before the AI call, so a crash or a deploy mid-analysis
   * leaves it marked PROCESSING with nobody working on it. Anything claimed for
   * longer than an analysis could plausibly take goes back in the queue.
   */
  async function reclaimStuck(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - config.ai.timeoutMs * 3).toISOString();
      const reclaimed = await store.batches.reclaimStuck(cutoff, new Date().toISOString());
      if (reclaimed > 0) logger.warn('batches_reclaimed', { reclaimed });
    } catch (error) {
      logger.error(EVENTS.error, { stage: 'reclaim', reason: errorMessage(error) });
    }
  }

  async function prune(): Promise<void> {
    try {
      const before = new Date(Date.now() - RAW_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const removed = await store.rawEvents.prune(before);
      if (removed > 0) logger.debug('raw_events_pruned', { removed });
    } catch (error) {
      logger.error(EVENTS.error, { stage: 'prune', reason: errorMessage(error) });
    }
  }

  return {
    start() {
      stopped = false;
      // Recover anything the previous process was holding when it stopped.
      void reclaimStuck();

      timer = setInterval(() => {
        inFlight = tick();
      }, config.processing.pollIntervalMs);
      timer.unref();

      pruneTimer = setInterval(() => {
        void reclaimStuck();
        void prune();
      }, PRUNE_INTERVAL_MS);
      pruneTimer.unref();

      logger.info('scheduler_started', {
        poll_interval_ms: config.processing.pollIntervalMs,
        debounce_ms: config.processing.debounceMs,
      });
    },

    async stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      if (pruneTimer) clearInterval(pruneTimer);
      timer = null;
      pruneTimer = null;
      await inFlight;
      logger.info('scheduler_stopped');
    },
  };
}
