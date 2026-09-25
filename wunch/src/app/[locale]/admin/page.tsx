import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Locale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminLive } from "@/components/admin/admin-live";
import { OrderCard } from "@/components/admin/order-card";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireAdminPage } from "@/lib/auth";
import { type AdminOrder, getCookingSummary, getDeliveryList, getUndecidedOrders } from "@/lib/data/admin";
import { formatDayLong, formatSlotInstants } from "@/lib/format";
import { formatCHF } from "@/lib/money";
import { addDays, isValidDateString, zurichNow } from "@/lib/schedule";

export const dynamic = "force-dynamic";

export default async function AdminTodayPage({ params, searchParams }: PageProps<"/[locale]/admin">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  await requireAdminPage(locale, "/admin");
  const { date: requested } = (await searchParams) as { date?: string };
  const today = zurichNow().date;
  const date = requested && isValidDateString(requested) ? requested : today;
  const t = await getTranslations("admin.today");

  const [orders, undecided] = await Promise.all([getDeliveryList(date), getUndecidedOrders(date)]);
  const cooking = await getCookingSummary(date, orders);

  // group by slot
  const slots = new Map<string, AdminOrder[]>();
  for (const o of orders) {
    const key = formatSlotInstants(o.slot_starts_at, o.slot_ends_at);
    slots.set(key, [...(slots.get(key) ?? []), o]);
  }
  const newIds = [...orders, ...undecided].filter((o) => o.status === "new").map((o) => o.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="icon" aria-label={t("prevDay")}>
            <Link href={{ pathname: "/admin", query: { date: addDays(date, -1) } }}>
              <ChevronLeft aria-hidden />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-extrabold">{date === today ? t("title") : formatDayLong(date, locale)}</h1>
            {date === today && <p className="text-sm text-muted-foreground">{formatDayLong(date, locale)}</p>}
          </div>
          <Button asChild variant="ghost" size="icon" aria-label={t("nextDay")}>
            <Link href={{ pathname: "/admin", query: { date: addDays(date, 1) } }}>
              <ChevronRight aria-hidden />
            </Link>
          </Button>
        </div>
        <AdminLive newOrderIds={newIds} />
      </div>

      {cooking.length > 0 && (
        <section aria-labelledby="to-cook">
          <h2 id="to-cook" className="mb-2 text-lg font-bold">
            {t("toCook")}
          </h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {cooking.map((c) => (
              <li key={c.mealId} className="rounded-xl border bg-card p-3" data-testid={`cook-${c.mealId}`}>
                <p className="line-clamp-2 text-sm font-semibold">{locale === "en" ? c.nameEn : c.nameDe}</p>
                <p className="mt-1 font-heading text-3xl font-extrabold tabular-nums">{c.confirmed + c.pending}</p>
                <p className="text-xs text-muted-foreground">
                  {t("acceptedCount", { count: c.confirmed })}
                  {c.pending > 0 && <span className="font-semibold text-warning"> · {t("pendingCount", { count: c.pending })}</span>}
                </p>
                <p className="text-xs text-muted-foreground">{c.portionsLeft === null ? t("unlimited") : t("portionsLeft", { count: c.portionsLeft })}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {undecided.length > 0 && (
        <section aria-labelledby="undecided">
          <h2 id="undecided" className="mb-2 text-lg font-bold">
            {t("undecidedOther")}
          </h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {undecided.map((o) => (
              <OrderCard key={o.id} order={o} showDate />
            ))}
          </div>
        </section>
      )}

      {orders.length === 0 ? (
        <p className="rounded-xl bg-secondary p-6 text-center">{t("noOrders")}</p>
      ) : (
        [...slots.entries()].map(([slot, list]) => (
          <section key={slot} aria-labelledby={`slot-${slot}`}>
            <h2 id={`slot-${slot}`} className="mb-2 flex flex-wrap items-baseline gap-x-3 text-lg font-bold">
              <span className="tabular-nums">{slot}</span>
              <span className="text-sm font-medium text-muted-foreground">
                {t("summary", { orders: t("orders", { count: list.length }), total: formatCHF(list.reduce((s, o) => s + o.total_rappen, 0)) })}
              </span>
            </h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {list.map((o) => (
                <OrderCard key={o.id} order={o} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
