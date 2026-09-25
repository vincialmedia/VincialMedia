import "server-only";
import { syncAllAdminRoles } from "../auth";
import { notifyAdminReminder } from "../email/notify";
import { CAPTURE_SAFETY_HOURS, PENDING_PAYMENT_TIMEOUT_MINUTES } from "../schedule";
import { getStripe } from "../stripe/server";
import { createAdminClient } from "../supabase/admin";
import { type Actor, autoCancelOrder, expirePendingOrder } from "./lifecycle";

export type TickReport = { autoCancelled: string[]; expired: string[]; reminded: number; feesBackfilled: number; errors: string[] };

const actor: Actor = { type: "system", label: "scheduled job" };

/**
 * Runs every 5 minutes (pg_cron -> /api/cron/tick):
 * 1. cancel "new" orders whose slot has started or whose card hold is within
 *    12 hours of Stripe's capture_before, and tell the customer
 * 2. release portions held by checkouts stuck in pending_payment > 30 minutes
 * 3. remind the admin about orders waiting longer than the reminder setting
 * 4. fill in Stripe fees that weren't available right after capture
 */
export async function runTick(now = new Date()): Promise<TickReport> {
  const db = createAdminClient();
  const report: TickReport = { autoCancelled: [], expired: [], reminded: 0, feesBackfilled: 0, errors: [] };
  const nowIso = now.toISOString();
  const safetyIso = new Date(now.getTime() + CAPTURE_SAFETY_HOURS * 3_600_000).toISOString();

  // 1. undecided orders that ran out of time
  const { data: due } = await db
    .from("orders")
    .select("id, order_number, slot_starts_at, capture_before")
    .eq("status", "new")
    .or(`slot_starts_at.lte.${nowIso},capture_before.lte.${safetyIso}`);
  for (const o of due ?? []) {
    const why = new Date(o.slot_starts_at) <= now ? "No decision before the delivery slot started" : "Card hold about to expire (12 hours before Stripe's capture deadline)";
    const result = await autoCancelOrder(o.id, why, actor).catch((e: Error) => ({ ok: false as const, error: e.message }));
    if (result.ok) report.autoCancelled.push(o.id);
    else if (result.error !== "wrong_status" && result.error !== "busy") report.errors.push(`auto-cancel #${o.order_number}: ${result.error}`);
  }

  // 2. abandoned checkouts
  const staleIso = new Date(now.getTime() - PENDING_PAYMENT_TIMEOUT_MINUTES * 60_000).toISOString();
  const { data: stale } = await db.from("orders").select("*").eq("status", "pending_payment").lte("created_at", staleIso);
  for (const o of stale ?? []) {
    try {
      await expirePendingOrder(o, actor, `No payment within ${PENDING_PAYMENT_TIMEOUT_MINUTES} minutes`);
      report.expired.push(o.id);
    } catch (e) {
      report.errors.push(`expire #${o.order_number}: ${(e as Error).message}`);
    }
  }

  // 3. reminder for orders waiting for a decision
  const { data: settings } = await db.from("settings").select("undecided_reminder_minutes").single();
  const remindIso = new Date(now.getTime() - (settings?.undecided_reminder_minutes ?? 10) * 60_000).toISOString();
  const { data: waiting } = await db
    .from("orders")
    .select("*")
    .eq("status", "new")
    .is("admin_reminded_at", null)
    .lte("authorized_at", remindIso)
    .order("slot_starts_at");
  if (waiting?.length) {
    await notifyAdminReminder(waiting);
    await db.from("orders").update({ admin_reminded_at: nowIso }).in("id", waiting.map((o) => o.id));
    report.reminded = waiting.length;
  }

  // 4. Stripe fee/net for captured orders that don't have it yet
  const { data: missingFees } = await db
    .from("orders")
    .select("id, stripe_payment_intent_id")
    .in("status", ["accepted", "delivered", "refunded", "partially_refunded"])
    .is("stripe_fee_rappen", null)
    .not("stripe_payment_intent_id", "is", null)
    .limit(20);
  for (const o of missingFees ?? []) {
    try {
      const pi = await getStripe().paymentIntents.retrieve(o.stripe_payment_intent_id!, { expand: ["latest_charge.balance_transaction"] });
      const charge = pi.latest_charge as { balance_transaction?: { fee: number; net: number } | null } | null;
      const bt = charge?.balance_transaction;
      if (bt) {
        await db.from("orders").update({ stripe_fee_rappen: bt.fee, stripe_net_rappen: bt.net }).eq("id", o.id);
        report.feesBackfilled++;
      }
    } catch (e) {
      report.errors.push(`fees ${o.id}: ${(e as Error).message}`);
    }
  }

  // keep profile roles in line with ADMIN_EMAILS
  await syncAllAdminRoles().catch((e: Error) => report.errors.push(`roles: ${e.message}`));
  return report;
}
