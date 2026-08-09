/**
 * All configuration comes from the environment. Nothing here has a credential
 * baked in as a default — a missing secret is a startup error, not a silent
 * fallback to something insecure.
 */

function str(name: string, fallback?: string): string {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return raw;
}

function optional(name: string): string | null {
  const raw = process.env[name];
  return raw === undefined || raw === '' ? null : raw;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) throw new Error(`Environment variable ${name} must be an integer`);
  return value;
}

function float(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) throw new Error(`Environment variable ${name} must be a number`);
  return value;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig() {
  const storeDriver = str('STORE_DRIVER', 'sqlite');
  if (storeDriver !== 'sqlite' && storeDriver !== 'supabase') {
    throw new Error(`STORE_DRIVER must be "sqlite" or "supabase", got "${storeDriver}"`);
  }

  const effort = str('AI_EFFORT', 'medium');
  if (!['low', 'medium', 'high', 'xhigh', 'max'].includes(effort)) {
    throw new Error(`AI_EFFORT must be one of low|medium|high|xhigh|max, got "${effort}"`);
  }

  return {
    env: str('NODE_ENV', 'development'),
    port: int('PORT', 3000),
    /** Public base url, used to build dashboard links in notifications. */
    publicUrl: str('PUBLIC_URL', 'http://localhost:3000').replace(/\/+$/, ''),

    store: {
      driver: storeDriver as 'sqlite' | 'supabase',
      sqlitePath: str('SQLITE_PATH', './data/jps.db'),
      supabaseUrl: optional('SUPABASE_URL'),
      supabaseServiceKey: optional('SUPABASE_SERVICE_ROLE_KEY'),
      /** Lets these tables live alongside other tables in a shared Supabase project. */
      tablePrefix: str('SUPABASE_TABLE_PREFIX', 'jps_'),
    },

    facebook: {
      /** Echoed back to Meta during webhook subscription setup. */
      verifyToken: optional('FB_VERIFY_TOKEN'),
      /** Meta App Secret. Without it we cannot verify signatures. */
      appSecret: optional('FB_APP_SECRET'),
      /** Only needed later, to reply to clients or fetch attachments. */
      pageAccessToken: optional('FB_PAGE_ACCESS_TOKEN'),
      /** Refuse unsigned webhook deliveries. Only turn off for local testing. */
      requireSignature: bool('FB_REQUIRE_SIGNATURE', true),
    },

    ai: {
      apiKey: optional('ANTHROPIC_API_KEY'),
      model: str('ANTHROPIC_MODEL', 'claude-opus-5'),
      effort: effort as 'low' | 'medium' | 'high' | 'xhigh' | 'max',
      maxTokens: int('AI_MAX_TOKENS', 8000),
      /** Wall-clock budget for a single AI call. */
      timeoutMs: int('AI_TIMEOUT_MS', 180_000),
    },

    processing: {
      /** How long the client must stay quiet before we treat the burst as finished. */
      debounceMs: int('MESSAGE_DEBOUNCE_MS', 60_000),
      /** How often we look for batches that are ready. */
      pollIntervalMs: int('SCHEDULER_INTERVAL_MS', 5_000),
      /** How many batches to process per tick. */
      batchLimit: int('SCHEDULER_BATCH_LIMIT', 5),
      /** Give up (and leave it for manual retry) after this many failures. */
      maxAttempts: int('MAX_PROCESSING_ATTEMPTS', 5),
      retryBaseMs: int('RETRY_BASE_MS', 30_000),
      /** How many earlier messages from this client the AI may see. */
      contextMessageLimit: int('CONTEXT_MESSAGE_LIMIT', 20),
      /** How far back that context window may reach. */
      contextWindowHours: int('CONTEXT_WINDOW_HOURS', 72),
      /** How many of the client's previous website requests the AI may see. */
      contextRequestLimit: int('CONTEXT_REQUEST_LIMIT', 5),
      /** Below this, a change request is held for clarification instead of being marked ready. */
      confidenceThreshold: float('CONFIDENCE_THRESHOLD', 0.6),
    },

    notifications: {
      telegramBotToken: optional('TELEGRAM_BOT_TOKEN'),
      telegramChatId: optional('TELEGRAM_CHAT_ID'),
      /** Send an alert for POSSIBLE_CHANGE too. OTHER is never notified. */
      notifyPossibleChange: bool('NOTIFY_POSSIBLE_CHANGE', true),
    },

    dashboard: {
      /** Shared secret for the internal dashboard. Required unless explicitly disabled. */
      token: optional('DASHBOARD_TOKEN'),
      enabled: bool('DASHBOARD_ENABLED', true),
    },

    logLevel: str('LOG_LEVEL', 'info'),
  };
}

/** Fail fast on combinations that would only break later, at request time. */
export function assertRunnable(config: Config): void {
  const problems: string[] = [];

  if (config.store.driver === 'supabase') {
    if (!config.store.supabaseUrl) problems.push('STORE_DRIVER=supabase requires SUPABASE_URL');
    if (!config.store.supabaseServiceKey) {
      problems.push('STORE_DRIVER=supabase requires SUPABASE_SERVICE_ROLE_KEY');
    }
  }
  if (!config.ai.apiKey) problems.push('ANTHROPIC_API_KEY is required to analyse messages');
  if (!config.facebook.verifyToken) problems.push('FB_VERIFY_TOKEN is required for webhook setup');
  if (config.facebook.requireSignature && !config.facebook.appSecret) {
    problems.push('FB_APP_SECRET is required (or set FB_REQUIRE_SIGNATURE=false for local testing)');
  }
  if (config.dashboard.enabled && !config.dashboard.token) {
    problems.push('DASHBOARD_TOKEN is required (or set DASHBOARD_ENABLED=false)');
  }

  if (problems.length > 0) {
    throw new Error(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
  }
}
