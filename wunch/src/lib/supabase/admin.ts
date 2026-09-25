import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

let client: ReturnType<typeof createClient<Database>> | null = null;

/**
 * Service-role client: bypasses RLS. Only for server code that has already
 * checked who is calling (webhooks, cron, order creation, admin actions).
 */
export function createAdminClient() {
  if (!client) {
    client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
