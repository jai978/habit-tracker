import type { Config } from '../config.ts';
import type { Store } from './store.ts';
import { createSqliteStore } from './sqlite-store.ts';
import { createSupabaseStore } from './supabase-store.ts';

export type { Store } from './store.ts';

export function createStore(config: Config): Store {
  if (config.store.driver === 'supabase') {
    const { supabaseUrl, supabaseServiceKey, tablePrefix } = config.store;
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('STORE_DRIVER=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    }
    return createSupabaseStore(supabaseUrl, supabaseServiceKey, tablePrefix);
  }
  return createSqliteStore(config.store.sqlitePath);
}
