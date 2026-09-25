import { CheckCircle2, Clock, XCircle } from "lucide-react";
import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { OrderLive } from "@/components/orders/order-live";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth";
import { formatDayLong, formatSlotInstants } from "@/lib/format";
import { formatCHF } from "@/lib/money";
import { syncPendingOrder } from "@/lib/orders/lifecycle";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/validation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("success");
  return { title: t("title"), robots: { index: false } };
}

export default async function SuccessPage({ params, searchParams }: PageProps<"/[locale]/checkout/success">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const { order: orderId } = (await searchParams) as { order?: string };
  if (!orderId || !UUID_RE.test(orderId)) notFound();
  const user = await requireUser(locale, `${locale === "en" ? "/en" : ""}/checkout/success?order=${orderId}`);

  const supabase = await createClient();
  const load = async () => (await supabase.from("orders").select("*").eq("id", orderId).maybeSingle()).data;
  let order = await load();
  if (!order) notFound();
  if (order.status === "pending_payment") {
    // don't wait for the webhook: ask Stripe directly
    await syncPendingOrder(order, { type: "system", label: "confirmation page" }).catch((e) => console.error("confirmation page sync failed", e));
    // Re-read with another client: an identical request would be served from React's request memoization.
    const { data: fresh } = await createAdminClient().from("orders").select("*").eq("id", orderId).eq("user_id", user.id).maybeSingle();
    order = fresh ?? order;
  }

  const t = await getTranslations("success");
  const to = await getTranslations("orders");
  const amount = formatCHF(order.total_rappen);
  const date = formatDayLong(order.delivery_date, locale);
  const slot = formatSlotInstants(order.slot_starts_at, order.slot_ends_at);
  const s = order.status;
  const failed = s === "payment_failed" || s === "expired" || s === "auto_cancelled";

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <OrderLive orderId={order.id} status={s} clearCart={s !== "pending_payment" && !failed && s !== "rejected"} />
      <div className="rounded-2xl border bg-card p-6 text-center shadow-xs sm:p-8" data-testid="order-status" data-status={s}>
        {s === "pending_payment" && (
          <>
            <Clock className="mx-auto mb-3 size-12 text-muted-foreground" aria-hidden />
            <h1 className="mb-2 text-2xl font-extrabold">{t("processing")}</h1>
          </>
        )}
        {s === "new" && (
          <>
            <CheckCircle2 className="mx-auto mb-3 size-12 text-accent" aria-hidden />
            <h1 className="mb-1 text-2xl font-extrabold">{t("title")}</h1>
            <p className="mb-5 text-muted-foreground">{t("orderNumber", { number: order.order_number })}</p>
            <div className="space-y-2 rounded-xl bg-accent-soft p-4 text-left text-accent">
              <p className="font-semibold">{t("reserved", { amount })}</p>
              <p className="text-sm">{t("chargeWhenAccepted")}</p>
              <p className="text-sm">{t("ifRejected")}</p>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">{t("live")}</p>
          </>
        )}
        {(s === "accepted" || s === "delivered") && (
          <>
            <CheckCircle2 className="mx-auto mb-3 size-12 text-accent" aria-hidden />
            <h1 className="mb-2 text-2xl font-extrabold">{t("acceptedTitle")}</h1>
            <p>{t("accepted", { amount, date, slot })}</p>
          </>
        )}
        {s === "rejected" && (
          <>
            <XCircle className="mx-auto mb-3 size-12 text-destructive" aria-hidden />
            <h1 className="mb-2 text-2xl font-extrabold">{t("rejectedTitle")}</h1>
            {order.reject_reason && <p className="mb-2">{to("rejectReason", { reason: order.reject_reason })}</p>}
            <p className="text-muted-foreground">{t("failed")}</p>
          </>
        )}
        {failed && (
          <>
            <XCircle className="mx-auto mb-3 size-12 text-destructive" aria-hidden />
            <h1 className="mb-2 text-2xl font-extrabold">{t("failedTitle")}</h1>
            <p className="mb-4 text-muted-foreground">{t("failed")}</p>
            <Button asChild>
              <Link href="/checkout">{t("tryAgain")}</Link>
            </Button>
          </>
        )}
        {!failed && s !== "pending_payment" && (
          <Button asChild variant="outline" className="mt-6">
            <Link href={`/orders/${order.id}`}>{t("viewOrder")}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
