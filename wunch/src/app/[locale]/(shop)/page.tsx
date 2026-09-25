import type { Locale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CartBar } from "@/components/cart/cart-bar";
import { DatePicker } from "@/components/menu/date-picker";
import { MealCard } from "@/components/menu/meal-card";
import { getMenuForDate } from "@/lib/data/menu";
import { getClosedDates, getSettings, toCalendarSettings } from "@/lib/data/settings";
import { getOrderableDates, isBeforeCutoff, shortTime, zurichNow } from "@/lib/schedule";

export default async function MenuPage({ params, searchParams }: PageProps<"/[locale]">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const { date: requested } = (await searchParams) as { date?: string };
  const t = await getTranslations("menu");

  const now = new Date();
  const settings = await getSettings();
  const today = zurichNow(now).date;
  const dates = getOrderableDates(now, toCalendarSettings(settings), await getClosedDates(today));
  const selected = requested && dates.includes(requested) ? requested : dates[0];
  const menu = selected ? await getMenuForDate(selected) : [];
  const cutoff = shortTime(settings.same_day_cutoff);
  const cutoffPassed = !isBeforeCutoff(now, toCalendarSettings(settings));

  const groups = new Map<string, typeof menu>();
  for (const item of menu) groups.set(item.meal.category, [...(groups.get(item.meal.category) ?? []), item]);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 pb-28 sm:pt-10">
      <section className="mb-6 space-y-2">
        <h1 className="text-3xl font-extrabold sm:text-5xl">{t("title")}</h1>
        <p className="max-w-xl text-muted-foreground sm:text-lg">{t("intro", { cutoff })}</p>
      </section>

      {dates.length === 0 ? (
        <p className="rounded-xl bg-secondary p-6 text-center">{t("noDates")}</p>
      ) : (
        <>
          <DatePicker dates={dates} selected={selected} today={today} locale={locale} />
          {cutoffPassed && dates[0] !== today && selected === dates[0] && (
            <p className="mt-3 text-sm text-muted-foreground">{t("cutoffPassed", { cutoff })}</p>
          )}
          {menu.length === 0 ? (
            <p className="mt-8 rounded-xl bg-secondary p-6 text-center">{t("empty")}</p>
          ) : (
            [...groups.entries()].map(([category, items], gi) => (
              <section key={category} className="mt-8" aria-labelledby={`cat-${category}`}>
                <h2 id={`cat-${category}`} className="mb-4 text-xl font-bold">
                  {t(`categories.${category}`)}
                </h2>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((item, i) => (
                    <MealCard key={item.meal.id} item={item} date={selected} priority={gi === 0 && i < 2} />
                  ))}
                </div>
              </section>
            ))
          )}
        </>
      )}
      <CartBar />
    </div>
  );
}
