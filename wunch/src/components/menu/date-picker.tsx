import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatDayShort, formatWeekday } from "@/lib/format";
import { addDays } from "@/lib/schedule";
import { cn } from "@/lib/utils";

export async function DatePicker({
  dates,
  selected,
  today,
  locale,
  basePath = "/",
}: {
  dates: string[];
  selected: string;
  today: string;
  locale: string;
  basePath?: string;
}) {
  const t = await getTranslations("common");
  const tm = await getTranslations("menu");
  return (
    <nav aria-label={tm("pickDate")} className="-mx-4 overflow-x-auto px-4 pb-1">
      <ul className="flex gap-2">
        {dates.map((date) => {
          const label = date === today ? t("today") : date === addDays(today, 1) ? t("tomorrow") : formatWeekday(date, locale, "long");
          const active = date === selected;
          return (
            <li key={date}>
              <Link
                href={{ pathname: basePath, query: { date } }}
                aria-current={active ? "date" : undefined}
                scroll={false}
                className={cn(
                  "flex min-w-24 flex-col rounded-xl border px-4 py-2.5 text-left transition-colors",
                  active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40",
                )}
              >
                <span className="text-sm font-semibold">{label}</span>
                <span className={cn("text-xs", active ? "text-primary-foreground/85" : "text-muted-foreground")}>
                  {formatDayShort(date, locale)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
