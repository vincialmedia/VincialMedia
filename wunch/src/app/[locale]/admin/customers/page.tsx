import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { requireAdminPage } from "@/lib/auth";
import { formatDate, formatInstantDate } from "@/lib/format";
import { formatCHF } from "@/lib/money";
import { createAdminClient } from "@/lib/supabase/admin";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin.customers"))("title") };
}

const PAID = new Set(["accepted", "delivered", "refunded", "partially_refunded"]);

export default async function CustomersPage({ params, searchParams }: PageProps<"/[locale]/admin/customers">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  await requireAdminPage(locale, "/admin/customers");
  const { q: raw } = (await searchParams) as { q?: string };
  const q = (raw ?? "").replace(/[^\p{L}\p{N}@.\-_ ]/gu, "").trim().slice(0, 80);
  const t = await getTranslations("admin.customers");
  const tc = await getTranslations("admin.common");

  const db = createAdminClient();
  let profileQuery = db.from("profiles").select("*").order("created_at", { ascending: false }).limit(500);
  if (q) profileQuery = profileQuery.or(`full_name.ilike.%${q}%,company.ilike.%${q}%,email.ilike.%${q}%`);
  const [{ data: profiles }, { data: orders }] = await Promise.all([
    profileQuery,
    db.from("orders").select("user_id, status, amount_captured_rappen, amount_refunded_rappen, delivery_date, company, customer_name, phone"),
  ]);

  const stats = new Map<string, { orders: number; spent: number; last: string | null; company: string | null; name: string | null; phone: string | null }>();
  for (const o of orders ?? []) {
    if (!o.user_id || !PAID.has(o.status)) continue;
    const s = stats.get(o.user_id) ?? { orders: 0, spent: 0, last: null, company: null, name: null, phone: null };
    s.orders += 1;
    s.spent += o.amount_captured_rappen - o.amount_refunded_rappen;
    if (!s.last || o.delivery_date > s.last) {
      s.last = o.delivery_date;
      s.company = o.company;
      s.name = o.customer_name;
      s.phone = o.phone;
    }
    stats.set(o.user_id, s);
  }
  const rows = (profiles ?? [])
    .filter((p) => p.role !== "admin")
    .map((p) => ({ p, s: stats.get(p.id) }))
    .sort((a, b) => (b.s?.last ?? "").localeCompare(a.s?.last ?? "") || b.p.created_at.localeCompare(a.p.created_at));

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">{t("title")}</h1>
      <form method="get" className="flex gap-2">
        <Input name="q" defaultValue={q} placeholder={t("search")} aria-label={t("search")} className="max-w-sm" />
        <Button type="submit">{tc("filter")}</Button>
      </form>
      {rows.length === 0 ? (
        <p className="rounded-xl bg-secondary p-6 text-center">{t("empty")}</p>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>{t("col.name")}</TH>
              <TH>{t("col.company")}</TH>
              <TH>{t("col.email")}</TH>
              <TH>{t("col.phone")}</TH>
              <TH className="text-right">{t("col.orders")}</TH>
              <TH className="text-right">{t("col.spent")}</TH>
              <TH>{t("col.lastOrder")}</TH>
              <TH>{t("col.since")}</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map(({ p, s }) => (
              <TR key={p.id}>
                <TD className="font-medium">{p.full_name ?? s?.name ?? "–"}</TD>
                <TD>{p.company ?? s?.company ?? "–"}</TD>
                <TD>
                  <a href={`mailto:${p.email}`} className="text-primary hover:underline">
                    {p.email}
                  </a>
                </TD>
                <TD className="whitespace-nowrap">{p.phone ?? s?.phone ?? "–"}</TD>
                <TD className="text-right tabular-nums">{s?.orders ?? 0}</TD>
                <TD className="text-right tabular-nums">{formatCHF(s?.spent ?? 0)}</TD>
                <TD className="whitespace-nowrap">
                  {s?.last ? (
                    <Link href={{ pathname: "/admin/orders", query: { q: p.email } }} className="text-primary hover:underline">
                      {formatDate(s.last)}
                    </Link>
                  ) : (
                    "–"
                  )}
                </TD>
                <TD className="whitespace-nowrap">{formatInstantDate(p.created_at)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
