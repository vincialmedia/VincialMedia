import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import type { MenuItem } from "@/lib/data/menu";
import { formatCHF } from "@/lib/money";
import { cn } from "@/lib/utils";
import { AddToCartButton } from "./add-to-cart";
import { DietaryBadges } from "./dietary-badges";
import { MealImage } from "./meal-image";

export function MealCard({ item, date, priority }: { item: MenuItem; date: string; priority?: boolean }) {
  const t = useTranslations("menu");
  const tm = useTranslations("meal");
  const locale = useLocale();
  const { meal } = item;
  const name = locale === "en" ? meal.name_en : meal.name_de;
  const description = locale === "en" ? meal.description_en : meal.description_de;
  const low = item.portionsLeft !== null && item.portionsLeft > 0 && item.portionsLeft <= 5;

  return (
    <article className={cn("group flex flex-col overflow-hidden rounded-xl border bg-card shadow-xs", item.soldOut && "opacity-80")}>
      <Link href={{ pathname: `/meals/${meal.id}`, query: { date } }} className="relative block overflow-hidden" aria-label={t("details", { name })} tabIndex={-1}>
        <MealImage
          path={meal.image_path}
          alt={name}
          priority={priority}
          placeholderLabel={tm("photoPlaceholder")}
          className={cn("transition-transform duration-300 group-hover:scale-[1.03]", item.soldOut && "grayscale")}
        />
        {item.soldOut && (
          <Badge variant="destructive" className="absolute top-3 left-3 text-sm">
            {t("soldOut")}
          </Badge>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg leading-snug font-semibold">
            <Link href={{ pathname: `/meals/${meal.id}`, query: { date } }} className="hover:text-primary">
              {name}
            </Link>
          </h3>
          <p className="shrink-0 font-heading text-lg font-extrabold whitespace-nowrap">{formatCHF(meal.price_rappen)}</p>
        </div>
        <DietaryBadges tags={meal.dietary_tags} />
        <p className="line-clamp-2 text-sm text-muted-foreground">{description}</p>
        <div className="mt-auto flex items-center justify-between gap-3 pt-2">
          <span className={cn("text-xs font-medium", low ? "text-warning" : "text-muted-foreground")}>
            {low ? t("left", { count: item.portionsLeft! }) : ""}
          </span>
          <AddToCartButton
            date={date}
            disabled={item.soldOut}
            maxQuantity={item.portionsLeft}
            meal={{ mealId: meal.id, nameDe: meal.name_de, nameEn: meal.name_en, priceRappen: meal.price_rappen, imagePath: meal.image_path }}
          />
        </div>
      </div>
    </article>
  );
}
