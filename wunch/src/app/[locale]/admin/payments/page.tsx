import { Download } from "lucide-react";
import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { requireAdminPage } from "@/lib/auth";
import { getPayments, paymentRange } from "@/lib/data/payments";
import { formatDate } from "@/lib/format";
import { formatCHF } from "@/lib/money";
import { type GroupBy, type Totals, emptyTotals, addToTotals, groupPayments } from "@/lib/reports";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin.payments"))("title") };
}

export default async function PaymentsPage({ params, searchParams }: PageProps<"/[locale]/admin/payments">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  await requireAdminPage(locale, "/admin/payments");
  const sp = (await searchParams) as Record<string, string | undefined>;
  const { from, to } = paymentRange(sp.from, sp.to);
  const group: GroupBy = sp.group === "week" || sp.group === "month" ? sp.group : "day";
  const t = await getTranslations("admin.payments");
  const tc = await getTranslations("admin.common");
  const rows = await getPayments(from, to);
  const groups = groupPayments(rows, group);
  const total = rows.reduce(addToTotals, emptyTotals());

  const totalCells = (x: Totals) => (
    <>
      <TD className="text-right tabular-nums">{x.count}</TD>
      <TD className="text-right tabular-nums">{formatCHF(x.paid)}</TD>
      <TD className="text-right tabular-nums">{formatCHF(x.subtotal)}</TD>
      <TD className="text-right tabular-nums">{x.discount ? `−${formatCHF(x.discount)}` : "–"}</TD>
      <TD className="text-right tabular-nums">{formatCHF(x.tip)}</TD>
      <TD className="text-right tabular-nums">{formatCHF(x.deliveryFee)}</TD>
      <TD className="text-right tabular-nums">{x.refunded ? `−${formatCHF(x.refunded)}` : "–"}</TD>
      <TD className="text-right tabular-nums">−{formatCHF(x.fee)}</TD>
      <TD className="text-right font-semibold tabular-nums">{formatCHF(x.net)}</TD>
    </>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
      </div>
      <form method="get" className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 sm:grid-cols-4 sm:items-end">
        <div className="space-y-1">
          <Label htmlFor="p-from">{t("from")}</Label>
          <Input id="p-from" name="from" type="date" defaultValue={from} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="p-to">{t("to")}</Label>
          <Input id="p-to" name="to" type="date" defaultValue={to} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="p-group">{t("groupBy")}</Label>
          <Select id="p-group" name="group" defaultValue={group}>
            <option value="day">{t("day")}</option>
            <option value="week">{t("week")}</option>
            <option value="month">{t("month")}</option>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button type="submit" className="flex-1">
            {tc("filter")}
          </Button>
          <Button asChild variant="outline">
            <a href={`/api/admin/payments?from=${from}&to=${to}`} download>
              <Download aria-hidden />
              {t("export")}
            </a>
          </Button>
        </div>
      </form>

      {rows.length === 0 ? (
        <p className="rounded-xl bg-secondary p-6 text-center">{t("empty")}</p>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-lg font-bold">{t("totals")}</h2>
            <Table>
              <THead>
                <tr>
                  <TH>{t("col.period")}</TH>
                  <TH className="text-right">{t("col.count")}</TH>
                  <TH className="text-right">{t("col.paid")}</TH>
                  <TH className="text-right">{t("col.subtotal")}</TH>
                  <TH className="text-right">{t("col.discount")}</TH>
                  <TH className="text-right">{t("col.tip")}</TH>
                  <TH className="text-right">{t("col.deliveryFee")}</TH>
                  <TH className="text-right">{t("col.refunded")}</TH>
                  <TH className="text-right">{t("col.fee")}</TH>
                  <TH className="text-right">{t("col.net")}</TH>
                </tr>
              </THead>
              <TBody>
                {groups.map((g) => (
                  <TR key={g.key}>
                    <TD className="font-medium whitespace-nowrap">{g.label}</TD>
                    {totalCells(g.totals)}
                  </TR>
                ))}
                <TR className="bg-muted/50 font-bold">
                  <TD>{t("grandTotal")}</TD>
                  {totalCells(total)}
                </TR>
              </TBody>
            </Table>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold">{t("payments")}</h2>
            <Table>
              <THead>
                <tr>
                  <TH>{t("col.date")}</TH>
                  <TH>{t("col.order")}</TH>
                  <TH>{t("col.customer")}</TH>
                  <TH className="text-right">{t("col.paid")}</TH>
                  <TH className="text-right">{t("col.subtotal")}</TH>
                  <TH className="text-right">{t("col.discount")}</TH>
                  <TH className="text-right">{t("col.tip")}</TH>
                  <TH className="text-right">{t("col.deliveryFee")}</TH>
                  <TH className="text-right">{t("col.refunded")}</TH>
                  <TH className="text-right">{t("col.fee")}</TH>
                  <TH className="text-right">{t("col.net")}</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.orderId}>
                    <TD className="whitespace-nowrap">{formatDate(r.date)}</TD>
                    <TD>
                      <Link href={`/admin/orders/${r.orderId}`} className="font-bold text-primary hover:underline">
                        #{r.orderNumber}
                      </Link>
                    </TD>
                    <TD>
                      {r.customer}
                      {r.company && <span className="block text-xs text-muted-foreground">{r.company}</span>}
                    </TD>
                    <TD className="text-right tabular-nums">{formatCHF(r.paid)}</TD>
                    <TD className="text-right tabular-nums">{formatCHF(r.subtotal)}</TD>
                    <TD className="text-right tabular-nums whitespace-nowrap">
                      {r.discount ? `−${formatCHF(r.discount)}` : "–"}
                      {r.couponCode && <span className="block text-xs text-muted-foreground">{r.couponCode}</span>}
                    </TD>
                    <TD className="text-right tabular-nums">{formatCHF(r.tip)}</TD>
                    <TD className="text-right tabular-nums">{formatCHF(r.deliveryFee)}</TD>
                    <TD className="text-right tabular-nums">{r.refunded ? `−${formatCHF(r.refunded)}` : "–"}</TD>
                    <TD className="text-right tabular-nums">{r.fee === null ? t("pendingFee") : `−${formatCHF(r.fee)}`}</TD>
                    <TD className="text-right font-semibold tabular-nums">{r.net === null ? t("pendingFee") : formatCHF(r.net)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </section>
        </>
      )}
    </div>
  );
}
