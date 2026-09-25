"use server";

import { revalidatePath } from "next/cache";
import { ForbiddenError, assertAdmin } from "../auth";
import { parseCHF } from "../money";
import { type ActionResult, type Actor, acceptOrder, markDelivered, refundOrder, rejectOrder } from "../orders/lifecycle";
import { UUID_RE } from "../validation";

async function run(orderId: string, fn: (actor: Actor) => Promise<ActionResult>): Promise<ActionResult> {
  try {
    if (!UUID_RE.test(orderId)) return { ok: false, error: "not_found" };
    const admin = await assertAdmin();
    const result = await fn({ type: "admin", id: admin.id, label: admin.email });
    revalidatePath("/[locale]/admin", "layout");
    return result;
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: "forbidden" };
    console.error("admin order action failed", e);
    return { ok: false, error: "generic" };
  }
}

export async function acceptOrderAction(orderId: string) {
  return run(orderId, (actor) => acceptOrder(orderId, actor));
}

export async function rejectOrderAction(orderId: string, reason: string) {
  const trimmed = reason.trim().slice(0, 500);
  if (!trimmed) return { ok: false, error: "reason_required" } as ActionResult;
  return run(orderId, (actor) => rejectOrder(orderId, trimmed, actor));
}

export async function markDeliveredAction(orderId: string) {
  return run(orderId, (actor) => markDelivered(orderId, actor));
}

/** amount: "full" or a CHF string like "5.50" */
export async function refundOrderAction(orderId: string, amount: string, note: string) {
  const rappen = amount === "full" ? null : parseCHF(amount);
  if (amount !== "full" && (rappen === null || rappen <= 0)) return { ok: false, error: "invalid_amount" } as ActionResult;
  return run(orderId, (actor) => refundOrder(orderId, rappen, actor, note.trim().slice(0, 500) || undefined));
}
