import "server-only";
import Stripe from "stripe";
import { env } from "../env";

let client: Stripe | null = null;

/**
 * Stripe client. With STRIPE_API_BASE_URL set (local tests only) the same SDK
 * talks to the bundled emulator instead of api.stripe.com.
 */
export function getStripe(): Stripe {
  if (client) return client;
  const { STRIPE_SECRET_KEY, STRIPE_API_BASE_URL } = env();
  if (STRIPE_API_BASE_URL) {
    const url = new URL(STRIPE_API_BASE_URL);
    client = new Stripe(STRIPE_SECRET_KEY, {
      host: url.hostname,
      port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
      protocol: url.protocol === "https:" ? "https" : "http",
      maxNetworkRetries: 1,
      appInfo: { name: "wunch" },
    });
  } else {
    client = new Stripe(STRIPE_SECRET_KEY, { maxNetworkRetries: 2, appInfo: { name: "wunch" } });
  }
  return client;
}

export function isEmulator(): boolean {
  return !!env().STRIPE_API_BASE_URL;
}

/** Link to a payment in the Stripe Dashboard. */
export function stripeDashboardUrl(paymentIntentId: string): string {
  const test = env().STRIPE_SECRET_KEY.startsWith("sk_test") || isEmulator();
  return `https://dashboard.stripe.com/${test ? "test/" : ""}payments/${paymentIntentId}`;
}
