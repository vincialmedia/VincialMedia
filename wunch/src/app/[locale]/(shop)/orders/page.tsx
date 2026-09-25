import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ReorderButton } from "@/components/orders/reorder-button";
import { StatusBadge } from "@/components/orders/status-badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth";
import { formatDayShort, formatSlotInstants } from "@/lib/format";
import { formatCHF } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("orders");
  return { title: t("title"), robots: { index: false } };
}

export default async function OrdersPage({ params }: PageProps<"/[locale]/orders">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const user = await requireUser(locale, locale === "en" ? "/en/orders" : "/orders");
  const t = await getTranslations("orders");
  const supabase = await createClient();
  const { data: orders } = await supabase
    .from("orders")
    .select("*, order_items(name_de, name_en, quantity)")
    .eq("user_id", user.id)
    .not("status", "in", "(pending_payment,expired)")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <h1 className="mb-6 text-3xl font-extrabold">{t("title")}</h1>
      {!orders?.length ? (
        <div className="rounded-xl bg-secondary p-8 text-center">
          <p className="mb-4">{t("empty")}</p>
          <Button asChild>
            <Link href="/">{(await getTranslations("cart"))("toMenu")}</Link>
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => (
            <li key={o.id} className="rounded-xl border bg-card p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{t("order", { number: o.order_number })}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("deliveryOn", { date: formatDayShort(o.delivery_date, locale), slot: formatSlotInstants(o.slot_starts_at, o.slot_ends_at) })}
                  </p>
                </div>
                <div className="text-right">
                  <StatusBadge status={o.status} />
                  <p className="mt-1 font-semibold tabular-nums">{formatCHF(o.total_rappen)}</p>
                </div>
              </div>
              <p className="mt-2 text-sm">
                {o.order_items.map((i) => `${i.quantity}× ${locale === "en" ? i.name_en : i.name_de}`).join(", ")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button asChild size="sm" variant="secondary">
                  <Link href={`/orders/${o.id}`}>{t("viewReceipt")}</Link>
                </Button>
                <ReorderButton orderId={o.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
