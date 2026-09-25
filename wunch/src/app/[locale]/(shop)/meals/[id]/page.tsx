import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { CartBar } from "@/components/cart/cart-bar";
import { AddToCartButton } from "@/components/menu/add-to-cart";
import { DietaryBadges } from "@/components/menu/dietary-badges";
import { MealImage } from "@/components/menu/meal-image";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { getMeal, getMenuForDate } from "@/lib/data/menu";
import { getClosedDates, getSettings, toCalendarSettings } from "@/lib/data/settings";
import { formatDayLong, formatDayShort } from "@/lib/format";
import { formatCHF } from "@/lib/money";
import type { Allergen } from "@/lib/i18n-keys";
import { getOrderableDates, zurichNow } from "@/lib/schedule";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: PageProps<"/[locale]/meals/[id]">): Promise<Metadata> {
  const { id, locale } = await params;
  if (!UUID.test(id)) return {};
  const meal = await getMeal(id);
  if (!meal) return {};
  return { title: locale === "en" ? meal.name_en : meal.name_de };
}

export default async function MealPage({ params, searchParams }: PageProps<"/[locale]/meals/[id]">) {
  const { id, locale } = (await params) as { id: string; locale: Locale };
  setRequestLocale(locale);
  if (!UUID.test(id)) notFound();
  const { date: requested } = (await searchParams) as { date?: string };
  const meal = await getMeal(id);
  if (!meal) notFound();

  const t = await getTranslations("meal");
  const tMenu = await getTranslations("menu");
  const tAll = await getTranslations("allergens");

  const now = new Date();
  const settings = await getSettings();
  const today = zurichNow(now).date;
  const dates = getOrderableDates(now, toCalendarSettings(settings), await getClosedDates(today));
  const date = requested && dates.includes(requested) ? requested : dates[0];

  // Where is this meal on the menu (selected date first)?
  const menus = await Promise.all(dates.map(async (d) => ({ d, item: (await getMenuForDate(d)).find((i) => i.meal.id === meal.id) })));
  const onSelected = menus.find((m) => m.d === date)?.item;
  const otherDates = menus.filter((m) => m.item && m.d !== date).map((m) => m.d);

  const name = locale === "en" ? meal.name_en : meal.name_de;
  const description = locale === "en" ? meal.description_en : meal.description_de;

  return (
    <div className="mx-auto max-w-5xl px-4 pt-4 pb-28 sm:pt-8">
      <Link href={{ pathname: "/", query: date ? { date } : {} }} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        {t("backToMenu")}
      </Link>
      <div className="grid gap-6 md:grid-cols-2 md:gap-10">
        <div className="overflow-hidden rounded-2xl">
          <MealImage path={meal.image_path} alt={name} priority sizes="(min-width: 768px) 50vw, 100vw" placeholderLabel={t("photoPlaceholder")} />
        </div>
        <div className="space-y-5">
          <div className="space-y-3">
            <h1 className="text-3xl font-extrabold sm:text-4xl">{name}</h1>
            <p className="font-heading text-2xl font-extrabold text-primary">{formatCHF(meal.price_rappen)}</p>
            <DietaryBadges tags={meal.dietary_tags} />
          </div>
          <p className="text-base leading-relaxed whitespace-pre-line">{description}</p>

          <section aria-labelledby="allergens" className="rounded-xl bg-secondary/70 p-4">
            <h2 id="allergens" className="mb-2 font-semibold">
              {t("allergens")}
            </h2>
            {meal.allergens.length ? (
              <ul className="flex flex-wrap gap-1.5">
                {meal.allergens.map((a) => (
                  <li key={a}>
                    <Badge variant="outline" className="bg-card">
                      {tAll(a as Allergen)}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("noAllergens")}</p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">{t("allergenNote")}</p>
          </section>

          {date && onSelected ? (
            <div className="space-y-3 rounded-xl border bg-card p-4">
              <p className="text-sm font-medium">{t("forDate", { date: formatDayLong(date, locale) })}</p>
              {onSelected.soldOut ? (
                <Badge variant="destructive" className="text-sm">
                  {tMenu("soldOut")}
                </Badge>
              ) : (
                <>
                  {onSelected.portionsLeft !== null && onSelected.portionsLeft <= 5 && (
                    <p className="text-sm text-warning">{tMenu("left", { count: onSelected.portionsLeft })}</p>
                  )}
                  <AddToCartButton
                    withQuantity
                    date={date}
                    maxQuantity={onSelected.portionsLeft}
                    meal={{ mealId: meal.id, nameDe: meal.name_de, nameEn: meal.name_en, priceRappen: meal.price_rappen, imagePath: meal.image_path }}
                  />
                </>
              )}
            </div>
          ) : (
            date && <p className="rounded-xl bg-secondary p-4 text-sm">{t("notOnDate", { date: formatDayLong(date, locale) })}</p>
          )}

          {otherDates.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {otherDates.map((d) => (
                <li key={d}>
                  <Link href={{ pathname: `/meals/${meal.id}`, query: { date: d } }} className="inline-flex rounded-full border bg-card px-3 py-1.5 text-sm hover:border-primary/50">
                    {formatDayShort(d, locale)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <CartBar />
    </div>
  );
}
