import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { StatusBadge } from "@/components/orders/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { requireAdminPage } from "@/lib/auth";
import { formatDayShort, formatSlotInstants } from "@/lib/format";
import type { StatusKey } from "@/lib/i18n-keys";
import { formatCHF } from "@/lib/money";
import { isValidDateString } from "@/lib/schedule";
import { stripeDashboardUrl } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin.orders"))("title") };
}

const STATUSES: StatusKey[] = ["new", "accepted", "delivered", "rejected", "auto_cancelled", "payment_failed", "refunded", "partially_refunded", "pending_payment", "expired"];
const PAGE_SIZE = 50;

export default async function AdminOrdersPage({ params, searchParams }: PageProps<"/[locale]/admin/orders">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  await requireAdminPage(locale, "/admin/orders");
  const sp = (await searchParams) as Record<string, string | undefined>;
  const t = await getTranslations("admin.orders");
  const tc = await getTranslations("admin.common");
  const ts = await getTranslations("status");

  const from = sp.from && isValidDateString(sp.from) ? sp.from : "";
  const to = sp.to && isValidDateString(sp.to) ? sp.to : "";
  const status = STATUSES.includes(sp.status as StatusKey) ? (sp.status as StatusKey) : "";
  const q = (sp.q ?? "").replace(/[^\p{L}\p{N}@.\-_ ]/gu, "").trim().slice(0, 80);
  const coupon = (sp.coupon ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
  const page = Math.max(1, Number(sp.page) || 1);

  let query = createAdminClient()
    .from("orders")
    .select("*, order_items(name_de, name_en, quantity)", { count: "exact" })
    .order("delivery_date", { ascending: false })
    .order("slot_starts_at", { ascending: true })
    .order("order_number", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (from) query = query.gte("delivery_date", from);
  if (to) query = query.lte("delivery_date", to);
  if (status) query = query.eq("status", status);
  else query = query.not("status", "in", "(pending_payment,expired)");
  if (q) query = query.or(`customer_name.ilike.%${q}%,company.ilike.%${q}%,customer_email.ilike.%${q}%`);
  if (coupon) query = query.ilike("coupon_code", coupon);
  const { data: orders, count } = await query;
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const pageLink = (p: number) => ({ pathname: "/admin/orders", query: { ...Object.fromEntries(Object.entries({ from, to, status, q, coupon }).filter(([, v]) => v)), page: String(p) } });

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">{t("title")}</h1>
      <form className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3 lg:grid-cols-6 lg:items-end" method="get">
        <div className="space-y-1">
          <Label htmlFor="f-from">{t("from")}</Label>
          <Input id="f-from" name="from" type="date" defaultValue={from} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-to">{t("to")}</Label>
          <Input id="f-to" name="to" type="date" defaultValue={to} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-status">{t("status")}</Label>
          <Select id="f-status" name="status" defaultValue={status}>
            <option value="">{t("allStatuses")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {ts(s)}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-q">{t("search")}</Label>
          <Input id="f-q" name="q" defaultValue={q} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-coupon">{t("coupon")}</Label>
          <Input id="f-coupon" name="coupon" defaultValue={coupon} />
        </div>
        <div className="col-span-2 flex gap-2 sm:col-span-1">
          <Button type="submit" className="flex-1">
            {tc("filter")}
          </Button>
          <Button asChild variant="ghost">
            <Link href="/admin/orders">{tc("reset")}</Link>
          </Button>
        </div>
      </form>

      <p className="text-sm text-muted-foreground">{t("count", { count: count ?? 0 })}</p>

      {!orders?.length ? (
        <p className="rounded-xl bg-secondary p-6 text-center">{t("empty")}</p>
      ) : (
        <Table label={t("title")}>
          <THead>
            <tr>
              <TH>{t("col.number")}</TH>
              <TH>{t("col.delivery")}</TH>
              <TH>{t("col.customer")}</TH>
              <TH>{t("col.company")}</TH>
              <TH>{t("col.items")}</TH>
              <TH className="text-right">{t("col.subtotal")}</TH>
              <TH className="text-right">{t("col.discount")}</TH>
              <TH className="text-right">{t("col.deliveryFee")}</TH>
              <TH className="text-right">{t("col.tip")}</TH>
              <TH className="text-right">{t("col.total")}</TH>
              <TH>{t("col.payment")}</TH>
              <TH>{t("col.stripe")}</TH>
            </tr>
          </THead>
          <TBody>
            {orders.map((o) => (
              <TR key={o.id}>
                <TD>
                  <Link href={`/admin/orders/${o.id}`} className="font-bold text-primary hover:underline">
                    #{o.order_number}
                  </Link>
                </TD>
                <TD className="whitespace-nowrap">
                  {formatDayShort(o.delivery_date, locale)}
                  <span className="block text-xs text-muted-foreground">{formatSlotInstants(o.slot_starts_at, o.slot_ends_at)}</span>
                </TD>
                <TD>
                  {o.customer_name}
                  <span className="block text-xs text-muted-foreground">{o.customer_email}</span>
                </TD>
                <TD>{o.company ?? "–"}</TD>
                <TD className="min-w-48 text-xs">{o.order_items.map((i) => `${i.quantity}× ${locale === "en" ? i.name_en : i.name_de}`).join(", ")}</TD>
                <TD className="text-right tabular-nums">{formatCHF(o.subtotal_rappen)}</TD>
                <TD className="text-right tabular-nums whitespace-nowrap">
                  {o.discount_rappen ? `−${formatCHF(o.discount_rappen)}` : "–"}
                  {o.coupon_code && <span className="block text-xs text-muted-foreground">{o.coupon_code}</span>}
                </TD>
                <TD className="text-right tabular-nums">{formatCHF(o.delivery_fee_rappen)}</TD>
                <TD className="text-right tabular-nums">{formatCHF(o.tip_rappen)}</TD>
                <TD className="text-right font-semibold tabular-nums">{formatCHF(o.total_rappen)}</TD>
                <TD>
                  <StatusBadge status={o.status} />
                  {o.amount_refunded_rappen > 0 && <span className="block text-xs text-muted-foreground">−{formatCHF(o.amount_refunded_rappen)}</span>}
                </TD>
                <TD>
                  {o.stripe_payment_intent_id && (
                    <a href={stripeDashboardUrl(o.stripe_payment_intent_id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline" aria-label={`Stripe #${o.order_number}`}>
                      <ExternalLink className="size-4" aria-hidden />
                    </a>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-between" aria-label="Pagination">
          <Button asChild variant="outline" size="sm" className={page <= 1 ? "pointer-events-none opacity-50" : ""}>
            <Link href={pageLink(page - 1)}>{tc("prev")}</Link>
          </Button>
          <span className="text-sm">{tc("page", { page })} / {pages}</span>
          <Button asChild variant="outline" size="sm" className={page >= pages ? "pointer-events-none opacity-50" : ""}>
            <Link href={pageLink(page + 1)}>{tc("next")}</Link>
          </Button>
        </nav>
      )}
    </div>
  );
}
