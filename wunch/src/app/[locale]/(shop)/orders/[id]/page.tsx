import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { OrderLive } from "@/components/orders/order-live";
import { PrintButton } from "@/components/orders/print-button";
import { ReorderButton } from "@/components/orders/reorder-button";
import { StatusBadge } from "@/components/orders/status-badge";
import { getSettings } from "@/lib/data/settings";
import { requireUser } from "@/lib/auth";
import { formatDateTime, formatDayLong, formatSlotInstants, formatVatRate } from "@/lib/format";
import { formatCHF } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/validation";

export async function generateMetadata({ params }: PageProps<"/[locale]/orders/[id]">): Promise<Metadata> {
  const t = await getTranslations("orders");
  await params;
  return { title: t("receipt"), robots: { index: false } };
}

export default async function OrderPage({ params }: PageProps<"/[locale]/orders/[id]">) {
  const { locale, id } = (await params) as { locale: Locale; id: string };
  setRequestLocale(locale);
  if (!UUID_RE.test(id)) notFound();
  await requireUser(locale, `${locale === "en" ? "/en" : ""}/orders/${id}`);
  const supabase = await createClient();
  const { data: order } = await supabase.from("orders").select("*, order_items(*)").eq("id", id).maybeSingle();
  if (!order) notFound();
  const settings = await getSettings();
  const t = await getTranslations("orders");
  const tc = await getTranslations("checkout");
  const paid = ["accepted", "delivered", "refunded", "partially_refunded"].includes(order.status);
  const notCharged = ["rejected", "auto_cancelled", "payment_failed", "expired"].includes(order.status);
  const address = [order.customer_name, order.company, order.street, `${order.postcode} ${order.city}`, order.floor_room].filter(Boolean);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <OrderLive orderId={order.id} status={order.status} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <StatusBadge status={order.status} className="text-sm" />
        <div className="flex gap-2">
          <PrintButton label={t("print")} />
          <ReorderButton orderId={order.id} />
        </div>
      </div>

      <article className="rounded-2xl border bg-card p-5 sm:p-8 print:border-0 print:p-0">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-heading text-2xl font-extrabold text-primary">wunch</p>
            <p className="text-[0.62rem] font-semibold tracking-[0.22em] text-muted-foreground uppercase">work + lunch</p>
          </div>
          <div className="text-right text-sm">
            <h1 className="text-lg font-bold">{paid ? t("receiptTitle") : t("order", { number: order.order_number })}</h1>
            {paid && <p>{t("order", { number: order.order_number })}</p>}
            <p className="text-muted-foreground">{t("orderDate", { date: formatDateTime(order.created_at) })}</p>
          </div>
        </header>

        <div className="mb-6 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="font-semibold">{t("issuer")}</p>
            <p>{settings.business_name}</p>
            <p className="whitespace-pre-line">{settings.business_address}</p>
            {settings.vat_rate_bp > 0 && settings.vat_number && <p>{t("vatNumber", { number: settings.vat_number })}</p>}
          </div>
          <div>
            <p className="font-semibold">{t("deliverTo")}</p>
            {address.map((l) => (
              <p key={l}>{l}</p>
            ))}
            <p className="mt-1 font-medium">
              {formatDayLong(order.delivery_date, locale)}, {formatSlotInstants(order.slot_starts_at, order.slot_ends_at)}
            </p>
          </div>
        </div>

        <h2 className="mb-2 text-sm font-semibold">{t("items")}</h2>
        <table className="mb-4 w-full text-sm">
          <tbody className="divide-y">
            {order.order_items.map((i) => (
              <tr key={i.id}>
                <td className="py-2">
                  {i.quantity} × {locale === "en" ? i.name_en : i.name_de}
                  <span className="block text-xs text-muted-foreground">{formatCHF(i.unit_price_rappen)}</span>
                </td>
                <td className="py-2 text-right tabular-nums">{formatCHF(i.line_total_rappen)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="space-y-1 border-t pt-3 text-sm">
          <div className="flex justify-between">
            <dt>{tc("meals")}</dt>
            <dd className="tabular-nums">{formatCHF(order.subtotal_rappen)}</dd>
          </div>
          {order.discount_rappen > 0 && (
            <div className="flex justify-between text-accent">
              <dt>{tc("discount", { code: order.coupon_code ?? "" })}</dt>
              <dd className="tabular-nums">−{formatCHF(order.discount_rappen)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt>{tc("deliveryFee")}</dt>
            <dd className="tabular-nums">{order.delivery_fee_rappen ? formatCHF(order.delivery_fee_rappen) : tc("free")}</dd>
          </div>
          {order.tip_rappen > 0 && (
            <div className="flex justify-between">
              <dt>{tc("tipLine")}</dt>
              <dd className="tabular-nums">{formatCHF(order.tip_rappen)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t pt-2 text-base font-bold">
            <dt>{tc("total")}</dt>
            <dd className="tabular-nums">{formatCHF(order.total_rappen)}</dd>
          </div>
          {order.vat_rate_bp > 0 && (
            <div className="flex justify-between text-xs text-muted-foreground">
              <dt>{tc("vatIncluded", { rate: formatVatRate(order.vat_rate_bp) })}</dt>
              <dd className="tabular-nums">{formatCHF(order.vat_rappen)}</dd>
            </div>
          )}
        </dl>

        <div className="mt-6 rounded-xl bg-secondary/70 p-4 text-sm">
          <p className="font-semibold">{t("payment")}</p>
          <p>{paid ? `${t("paidWithCard")}${order.accepted_at ? `, ${formatDateTime(order.accepted_at)}` : ""}` : notCharged ? t("notCharged") : t("reservedOnly")}</p>
          {order.amount_refunded_rappen > 0 && <p>{t("refundedAmount", { amount: formatCHF(order.amount_refunded_rappen) })}</p>}
          {order.reject_reason && <p>{t("rejectReason", { reason: order.reject_reason })}</p>}
        </div>
      </article>
    </div>
  );
}
