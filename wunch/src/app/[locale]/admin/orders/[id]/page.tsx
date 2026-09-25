import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { OrderActions } from "@/components/admin/order-actions";
import { RefundForm } from "@/components/admin/refund-form";
import { StatusBadge } from "@/components/orders/status-badge";
import { Link } from "@/i18n/navigation";
import { requireAdminPage } from "@/lib/auth";
import { formatDateTime, formatDayLong, formatSlotInstants, formatVatRate } from "@/lib/format";
import type { StatusKey } from "@/lib/i18n-keys";
import { formatCHF } from "@/lib/money";
import { stripeDashboardUrl } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { UUID_RE } from "@/lib/validation";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/orders/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return {};
  const { data } = await createAdminClient().from("orders").select("order_number").eq("id", id).maybeSingle();
  return { title: data ? `#${data.order_number}` : undefined };
}

export default async function AdminOrderPage({ params }: PageProps<"/[locale]/admin/orders/[id]">) {
  const { locale, id } = (await params) as { locale: Locale; id: string };
  setRequestLocale(locale);
  await requireAdminPage(locale, `/admin/orders/${id}`);
  if (!UUID_RE.test(id)) notFound();
  const db = createAdminClient();
  const [{ data: order }, { data: events }, { data: emails }] = await Promise.all([
    db.from("orders").select("*, order_items(*)").eq("id", id).maybeSingle(),
    db.from("order_events").select("*").eq("order_id", id).order("id"),
    db.from("email_log").select("*").eq("order_id", id).order("id"),
  ]);
  if (!order) notFound();
  const t = await getTranslations("admin.order");
  const tc = await getTranslations("checkout");
  const ts = await getTranslations("status");
  const refundable = order.amount_captured_rappen - order.amount_refunded_rappen;
  const canRefund = ["accepted", "delivered", "partially_refunded"].includes(order.status) && refundable > 0;

  const row = (label: string, value: React.ReactNode, className = "") => (
    <div className={`flex justify-between gap-4 py-1 ${className}`}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </div>
  );

  return (
    <div className="space-y-5">
      <Link href="/admin/orders" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{t("title", { number: order.order_number })}</h1>
          <p className="text-sm text-muted-foreground">{t("placedAt", { time: formatDateTime(order.created_at) })}</p>
        </div>
        <div className="text-right">
          <StatusBadge status={order.status} className="text-sm" />
          <p className="font-heading text-2xl font-extrabold tabular-nums">{formatCHF(order.total_rappen)}</p>
        </div>
      </div>

      {(order.status === "new" || order.status === "accepted" || canRefund) && (
        <div className="flex flex-col gap-2 rounded-xl border bg-card p-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <OrderActions orderId={order.id} orderNumber={order.order_number} status={order.status} size="default" />
          </div>
          {canRefund && <RefundForm orderId={order.id} orderNumber={order.order_number} refundableRappen={refundable} />}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-2 font-bold">{t("customer")}</h2>
          <p className="font-semibold">{order.customer_name}</p>
          {order.company && <p>{order.company}</p>}
          <p>
            <a href={`mailto:${order.customer_email}`} className="text-primary hover:underline">
              {order.customer_email}
            </a>
          </p>
          <p>
            <a href={`tel:${order.phone.replace(/[^+0-9]/g, "")}`} className="text-primary hover:underline">
              {order.phone}
            </a>
          </p>
        </section>
        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-2 font-bold">{t("delivery")}</h2>
          <p className="font-semibold">
            {formatDayLong(order.delivery_date, locale)}, {formatSlotInstants(order.slot_starts_at, order.slot_ends_at)}
          </p>
          <p>{order.street}</p>
          <p>
            {order.postcode} {order.city}
          </p>
          {order.floor_room && <p className="font-semibold">{order.floor_room}</p>}
          {order.delivery_note && <p className="mt-2 rounded-lg bg-warning-soft px-2 py-1.5 text-sm text-warning">{order.delivery_note}</p>}
        </section>
        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-2 font-bold">{t("payment")}</h2>
          <dl className="text-sm">
            {order.capture_before && row(t("captureBefore", { time: "" }).replace(/\s*$/, ""), formatDateTime(order.capture_before))}
            {row(t("captured"), formatCHF(order.amount_captured_rappen))}
            {order.amount_refunded_rappen > 0 && row(t("refunded"), `−${formatCHF(order.amount_refunded_rappen)}`)}
            {order.stripe_fee_rappen !== null && row(t("fee"), `−${formatCHF(order.stripe_fee_rappen)}`)}
            {order.stripe_net_rappen !== null && row(t("net"), formatCHF(order.stripe_net_rappen - order.amount_refunded_rappen))}
          </dl>
          {order.stripe_payment_intent_id && (
            <a href={stripeDashboardUrl(order.stripe_payment_intent_id)} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              <ExternalLink className="size-4" aria-hidden />
              {t("stripe")}
            </a>
          )}
        </section>
      </div>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-2 font-bold">{t("items")}</h2>
        <table className="w-full text-sm">
          <tbody className="divide-y">
            {order.order_items.map((i) => (
              <tr key={i.id}>
                <td className="py-1.5">
                  {i.quantity} × {locale === "en" ? i.name_en : i.name_de}
                </td>
                <td className="py-1.5 text-right text-muted-foreground tabular-nums">{formatCHF(i.unit_price_rappen)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatCHF(i.line_total_rappen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="mt-2 max-w-sm space-y-0.5 border-t pt-2 text-sm sm:ml-auto">
          {row(tc("meals"), formatCHF(order.subtotal_rappen))}
          {order.discount_rappen > 0 && row(tc("discount", { code: order.coupon_code ?? "" }), `−${formatCHF(order.discount_rappen)}`)}
          {row(tc("deliveryFee"), formatCHF(order.delivery_fee_rappen))}
          {row(order.tip_percent ? `${tc("tipLine")} (${order.tip_percent} %)` : tc("tipLine"), formatCHF(order.tip_rappen))}
          {row(tc("total"), formatCHF(order.total_rappen), "font-bold border-t pt-1")}
          {order.vat_rate_bp > 0 && row(tc("vatIncluded", { rate: formatVatRate(order.vat_rate_bp) }), formatCHF(order.vat_rappen), "text-xs")}
        </dl>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-2 font-bold">{t("history")}</h2>
          {!events?.length ? (
            <p className="text-sm text-muted-foreground">{t("noEvents")}</p>
          ) : (
            <ol className="space-y-2 text-sm">
              {events.map((e) => (
                <li key={e.id} className="border-l-2 border-border pl-3">
                  <p className="font-medium">
                    {e.to_status && e.from_status !== e.to_status ? ts(e.to_status as StatusKey) : e.kind === "refund" ? t("refunded") : e.note}
                    {e.kind === "refund" && typeof (e.data as { refunded_now?: number }).refunded_now === "number" && ` ${formatCHF((e.data as { refunded_now: number }).refunded_now)}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(e.created_at)} · {t(`actor.${e.actor_type as "customer" | "admin" | "system" | "stripe"}`)}
                    {e.actor_label && ` · ${e.actor_label}`}
                  </p>
                  {e.note && e.to_status && e.from_status !== e.to_status && <p className="text-xs">{e.note}</p>}
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-2 font-bold">{t("emails")}</h2>
          {!emails?.length ? (
            <p className="text-sm text-muted-foreground">{t("noEmails")}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {emails.map((m) => (
                <li key={m.id}>
                  <p className="font-medium">
                    {m.template} <span className="text-xs text-muted-foreground">({m.status})</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(m.created_at)} · {m.to_email}
                  </p>
                  {m.error && <p className="text-xs text-destructive">{m.error}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
