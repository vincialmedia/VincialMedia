import { Plus } from "lucide-react";
import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { requireAdminPage } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { formatCHF } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin.coupons"))("title") };
}

export default async function AdminCouponsPage({ params }: PageProps<"/[locale]/admin/coupons">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  await requireAdminPage(locale, "/admin/coupons");
  const t = await getTranslations("admin.coupons");
  const supabase = await createClient();
  const [{ data: coupons }, { data: redemptions }] = await Promise.all([
    supabase.from("coupons").select("*").order("archived_at", { nullsFirst: true }).order("created_at", { ascending: false }),
    supabase.from("coupon_redemptions").select("coupon_id, discount_rappen").is("released_at", null),
  ]);
  const stats = new Map<string, { uses: number; discount: number }>();
  for (const r of redemptions ?? []) {
    const s = stats.get(r.coupon_id) ?? { uses: 0, discount: 0 };
    s.uses += 1;
    s.discount += r.discount_rappen;
    stats.set(r.coupon_id, s);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">{t("title")}</h1>
        <Button asChild>
          <Link href="/admin/coupons/new">
            <Plus aria-hidden />
            {t("new")}
          </Link>
        </Button>
      </div>
      {!coupons?.length ? (
        <p className="rounded-xl bg-secondary p-6 text-center">{t("empty")}</p>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>{t("code")}</TH>
              <TH>{t("value")}</TH>
              <TH>{t("validity")}</TH>
              <TH>{t("limits")}</TH>
              <TH className="text-right">{t("uses")}</TH>
              <TH className="text-right">{t("totalDiscount")}</TH>
            </tr>
          </THead>
          <TBody>
            {coupons.map((c) => {
              const s = stats.get(c.id) ?? { uses: 0, discount: 0 };
              return (
                <TR key={c.id} className={c.archived_at ? "opacity-60" : undefined}>
                  <TD>
                    <Link href={`/admin/coupons/${c.id}`} className="font-mono font-bold text-primary hover:underline">
                      {c.code}
                    </Link>
                    <div className="mt-1 flex gap-1">
                      {!c.is_active && !c.archived_at && <Badge variant="muted">{t("inactive")}</Badge>}
                      {c.archived_at && <Badge variant="destructive">{t("archivedBadge")}</Badge>}
                      {c.first_order_only && <Badge variant="secondary">{t("firstOrder")}</Badge>}
                    </div>
                  </TD>
                  <TD>{c.kind === "percent" ? `${c.percent_off} %` : formatCHF(c.amount_off_rappen ?? 0)}</TD>
                  <TD className="whitespace-nowrap">
                    {c.valid_from ? formatDate(c.valid_from) : "…"} – {c.valid_to ? formatDate(c.valid_to) : "…"}
                  </TD>
                  <TD className="text-xs">
                    {c.max_total_uses ?? "∞"} / {c.max_uses_per_customer ?? "∞"}
                    {c.min_order_rappen > 0 && <span className="block">≥ {formatCHF(c.min_order_rappen)}</span>}
                  </TD>
                  <TD className="text-right tabular-nums">{s.uses}</TD>
                  <TD className="text-right tabular-nums">{formatCHF(s.discount)}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </div>
  );
}
