import "server-only";
import { Resend } from "resend";
import { env } from "../env";

export type OutgoingEmail = {
  to: string[];
  subject: string;
  html: string;
  text: string;
  tags?: { name: string; value: string }[];
  idempotencyKey?: string;
};

export type SendResult = { status: "sent" | "dev" | "failed"; providerId?: string | null; error?: string };

let resend: Resend | null = null;

/** Resend in production; Mailpit (local Supabase) or the console in development. */
export async function sendEmail(email: OutgoingEmail): Promise<SendResult> {
  const { RESEND_API_KEY, EMAIL_FROM, EMAIL_REPLY_TO, MAILPIT_URL } = env();

  if (RESEND_API_KEY) {
    resend ??= new Resend(RESEND_API_KEY);
    const { data, error } = await resend.emails.send(
      {
        from: EMAIL_FROM,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
        replyTo: EMAIL_REPLY_TO || undefined,
        tags: email.tags,
      },
      email.idempotencyKey ? { idempotencyKey: email.idempotencyKey } : undefined,
    );
    if (error) return { status: "failed", error: `${error.name}: ${error.message}` };
    return { status: "sent", providerId: data?.id ?? null };
  }

  if (MAILPIT_URL) {
    const from = parseAddress(EMAIL_FROM);
    const res = await fetch(`${MAILPIT_URL}/api/v1/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        From: from,
        To: email.to.map((e) => ({ Email: e })),
        Subject: email.subject,
        HTML: email.html,
        Text: email.text,
        Tags: email.tags?.map((t) => `${t.name}:${t.value}`) ?? [],
      }),
    }).catch((e: Error) => ({ ok: false, status: 0, text: async () => e.message }) as const);
    if (!res.ok) return { status: "failed", error: `mailpit ${res.status}: ${await res.text()}` };
    return { status: "dev" };
  }

  console.info(`[email] (not sent: no RESEND_API_KEY) to=${email.to.join(",")} subject="${email.subject}"`);
  return { status: "dev" };
}

function parseAddress(value: string): { Email: string; Name?: string } {
  const m = value.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  return m ? { Name: m[1].trim(), Email: m[2].trim() } : { Email: value.trim() };
}
