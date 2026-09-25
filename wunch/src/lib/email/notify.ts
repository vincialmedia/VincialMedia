import "server-only";
import { adminEmails, siteUrl } from "../env";
import { autoCancelAt } from "../schedule";
import { createAdminClient } from "../supabase/admin";
import type { Tables } from "../supabase/database.types";
import * as T from "./templates";
import { sendEmail } from "./transport";

type Order = Tables<"orders">;

/** Localised path on the site: German at "/", English at "/en". */
function localPath(lang: T.Lang, path: string): string {
  return siteUrl(lang === "en" ? `/en${path}` : path);
}

async function loadContext(orderId: string) {
  const db = createAdminClient();
  const [{ data: order }, { data: items }, { data: settings }] = await Promise.all([
    db.from("orders").select("*").eq("id", orderId).single(),
    db.from("order_items").select("*").eq("order_id", orderId).order("name_de"),
    db.from("settings").select("*").single(),
  ]);
  if (!order || !settings) throw new Error(`order ${orderId} not found for email`);
  const lang: T.Lang = order.locale === "en" ? "en" : "de";
  const ctx: T.EmailContext = {
    order,
    items: items ?? [],
    settings,
    lang,
    orderUrl: localPath(lang, `/orders/${order.id}`),
    menuUrl: localPath(lang, "/"),
  };
  return ctx;
}

/**
 * Send once per dedupe key. Every attempt is written to email_log so the admin
 * can see what went out. Never throws: an email problem must not break a
 * payment flow.
 */
async function deliver(opts: {
  dedupeKey: string;
  template: string;
  to: string[];
  lang: T.Lang;
  orderId: string | null;
  rendered: T.Rendered;
}): Promise<void> {
  const db = createAdminClient();
  try {
    const { data: existing } = await db.from("email_log").select("id, status").eq("dedupe_key", opts.dedupeKey).maybeSingle();
    if (existing && existing.status !== "failed") return;

    const result = await sendEmail({
      to: opts.to,
      subject: opts.rendered.subject,
      html: opts.rendered.html,
      text: opts.rendered.text,
      tags: [{ name: "template", value: opts.template }],
      idempotencyKey: opts.dedupeKey,
    });
    const row = {
      dedupe_key: opts.dedupeKey,
      to_email: opts.to.join(", "),
      template: opts.template,
      locale: opts.lang,
      order_id: opts.orderId,
      status: result.status,
      provider_id: result.providerId ?? null,
      error: result.error ?? null,
    };
    if (existing) await db.from("email_log").update(row).eq("id", existing.id);
    else await db.from("email_log").insert(row);
    if (result.status === "failed") console.error(`[email] ${opts.template} failed: ${result.error}`);
  } catch (e) {
    console.error(`[email] ${opts.template} crashed`, e);
  }
}

async function adminRecipients(): Promise<{ to: string[]; lang: T.Lang }> {
  const db = createAdminClient();
  const { data: settings } = await db.from("settings").select("notify_email").single();
  const to = settings?.notify_email ? [settings.notify_email] : adminEmails();
  // admin emails use the language of the first admin's profile
  const { data: profile } = to[0]
    ? await db.from("profiles").select("locale").ilike("email", to[0]).maybeSingle()
    : { data: null };
  return { to, lang: profile?.locale === "en" ? "en" : "de" };
}

/** Emails must never break the flow that triggers them. */
async function guard(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.error(`[email] ${name} failed`, e);
  }
}

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------

export async function notifyOrderReceived(orderId: string) {
  await guard("notifyOrderReceived", async () => {
  const ctx = await loadContext(orderId);
  await deliver({ dedupeKey: `order_received/${orderId}`, template: "order_received", to: [ctx.order.customer_email], lang: ctx.lang, orderId, rendered: T.orderReceived(ctx) });
  });
}

export async function notifyOrderAccepted(orderId: string) {
  await guard("notifyOrderAccepted", async () => {
  const ctx = await loadContext(orderId);
  await deliver({ dedupeKey: `order_accepted/${orderId}`, template: "order_accepted", to: [ctx.order.customer_email], lang: ctx.lang, orderId, rendered: T.orderAccepted(ctx) });
  });
}

export async function notifyOrderRejected(orderId: string) {
  await guard("notifyOrderRejected", async () => {
  const ctx = await loadContext(orderId);
  await deliver({ dedupeKey: `order_rejected/${orderId}`, template: "order_rejected", to: [ctx.order.customer_email], lang: ctx.lang, orderId, rendered: T.orderRejected(ctx) });
  });
}

export async function notifyOrderAutoCancelled(orderId: string) {
  await guard("notifyOrderAutoCancelled", async () => {
  const ctx = await loadContext(orderId);
  await deliver({ dedupeKey: `order_auto_cancelled/${orderId}`, template: "order_auto_cancelled", to: [ctx.order.customer_email], lang: ctx.lang, orderId, rendered: T.orderAutoCancelled(ctx) });
  });
}

export async function notifyRefund(orderId: string, amountRappen: number, key: string) {
  await guard("notifyRefund", async () => {
  const ctx = await loadContext(orderId);
  await deliver({ dedupeKey: `refund/${orderId}/${key}`, template: "refund", to: [ctx.order.customer_email], lang: ctx.lang, orderId, rendered: T.orderRefunded(ctx, amountRappen) });
  });
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function notifyAdminNewOrder(orderId: string) {
  await guard("notifyAdminNewOrder", async () => {
  const { to, lang } = await adminRecipients();
  if (!to.length) return;
  const ctx = await loadContext(orderId);
  const decideBy = autoCancelAt(new Date(ctx.order.slot_starts_at), ctx.order.capture_before ? new Date(ctx.order.capture_before) : null);
  await deliver({
    dedupeKey: `admin_new_order/${orderId}`,
    template: "admin_new_order",
    to,
    lang,
    orderId,
    rendered: T.adminNewOrder({ ...ctx, lang, adminUrl: localPath(lang, `/admin/orders/${orderId}`), decideBy }),
  });
  });
}

export async function notifyAdminReminder(orders: Order[]) {
  await guard("notifyAdminReminder", async () => {
  const { to, lang } = await adminRecipients();
  if (!to.length || !orders.length) return;
  const { data: settings } = await createAdminClient().from("settings").select("*").single();
  if (!settings) return;
  await deliver({
    dedupeKey: `admin_reminder/${orders.map((o) => o.id).sort().join(",")}`,
    template: "admin_reminder",
    to,
    lang,
    orderId: orders.length === 1 ? orders[0].id : null,
    rendered: T.adminReminder(lang, orders.map((order) => ({ order, url: localPath(lang, `/admin/orders/${order.id}`) })), settings),
  });
  });
}
