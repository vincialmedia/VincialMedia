import "server-only";
import { createAdminClient } from "./supabase/admin";

/**
 * Fixed-window rate limit stored in Postgres (works across serverless
 * instances). Returns true when the call is allowed. Fails open if the
 * database is unreachable, since the real protections are elsewhere.
 */
export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("rate_limit_hit", {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("rate limit check failed", error.message);
    return true;
  }
  return data === true;
}

/** Is this key still under its limit? Doesn't count as a hit. */
export async function underLimit(key: string, max: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("rate_limit_peek", {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("rate limit peek failed", error.message);
    return true;
  }
  return data === true;
}

export const LIMITS = {
  checkoutPerUser: { max: 10, window: 600 },
  checkoutPerIp: { max: 30, window: 600 },
  couponFailuresPerIp: { max: 10, window: 600 },
  couponFailuresPerUser: { max: 10, window: 600 },
  quotePerIp: { max: 120, window: 60 },
} as const;
