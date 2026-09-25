import "server-only";
import { type PaymentRow, toPaymentRow } from "../reports";
import { addDays, isValidDateString, zurichDateTime, zurichNow } from "../schedule";
import { createAdminClient } from "../supabase/admin";

export function paymentRange(from?: string, to?: string): { from: string; to: string } {
  const today = zurichNow().date;
  return {
    from: from && isValidDateString(from) ? from : `${today.slice(0, 8)}01`,
    to: to && isValidDateString(to) ? to : today,
  };
}

/** Every captured payment in the range (by capture time, Zurich dates). */
export async function getPayments(from: string, to: string): Promise<PaymentRow[]> {
  const { data } = await createAdminClient()
    .from("orders")
    .select(
      "id, order_number, accepted_at, customer_name, company, amount_captured_rappen, subtotal_rappen, discount_rappen, coupon_code, tip_rappen, delivery_fee_rappen, amount_refunded_rappen, stripe_fee_rappen, stripe_net_rappen, stripe_payment_intent_id",
    )
    .in("status", ["accepted", "delivered", "refunded", "partially_refunded"])
    .gt("amount_captured_rappen", 0)
    .gte("accepted_at", zurichDateTime(from, "00:00").toISOString())
    .lt("accepted_at", zurichDateTime(addDays(to, 1), "00:00").toISOString())
    .order("accepted_at");
  return (data ?? []).map(toPaymentRow);
}
