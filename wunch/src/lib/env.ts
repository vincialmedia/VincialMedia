import "server-only";
import { z } from "zod";

// Server-side environment, validated once. See .env.example for what each one does.
const schema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  STRIPE_SECRET_KEY: z.string().min(1),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_API_BASE_URL: z.url().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().min(3).default("wunch <bestellung@wunch.ch>"),
  EMAIL_REPLY_TO: z.string().optional(),
  MAILPIT_URL: z.url().optional(),
  ADMIN_EMAILS: z.string().default(""),
  CRON_SECRET: z.string().min(16),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | null = null;

export function env(): ServerEnv {
  if (cached) return cached;
  const empty = (v: string | undefined) => (v === "" ? undefined : v);
  const parsed = schema.safeParse({
    ...process.env,
    STRIPE_API_BASE_URL: empty(process.env.STRIPE_API_BASE_URL),
    RESEND_API_KEY: empty(process.env.RESEND_API_KEY),
    EMAIL_REPLY_TO: empty(process.env.EMAIL_REPLY_TO),
    MAILPIT_URL: empty(process.env.MAILPIT_URL),
    EMAIL_FROM: empty(process.env.EMAIL_FROM),
  });
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid or missing environment variables: ${fields}. See .env.example.`);
  }
  if (parsed.data.STRIPE_API_BASE_URL && process.env.VERCEL_ENV === "production") {
    throw new Error("STRIPE_API_BASE_URL points Stripe at the local emulator and must not be set in production.");
  }
  cached = parsed.data;
  return cached;
}

export function adminEmails(): string[] {
  return env()
    .ADMIN_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function siteUrl(path = ""): string {
  return new URL(path, env().NEXT_PUBLIC_SITE_URL).toString();
}
