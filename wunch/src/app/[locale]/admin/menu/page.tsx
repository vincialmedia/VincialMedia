import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { WeekPlanner } from "@/components/admin/week-planner";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireAdminPage } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { addDays, isValidDateString, isoWeekday, startOfIsoWeek, zurichNow } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin.menu"))("title") };
}

export default async function MenuPlannerPage({ params, searchParams }: PageProps<"/[locale]/admin/menu">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  await requireAdminPage(locale, "/admin/menu");
  const { week } = (await searchParams) as { week?: string };
  const today = zurichNow().date;
  // on weekends the current week is over: open next week by default
  const defaultWeek = isoWeekday(today) >= 6 ? addDays(today, 7) : today;
  const monday = startOfIsoWeek(week && isValidDateString(week) ? week : defaultWeek);
  const sunday = addDays(monday, 6);
  const t = await getTranslations("admin.menu");

  const supabase = await createClient();
  const [{ data: settings }, { data: closed }, { data: entries }, { data: meals }] = await Promise.all([
    supabase.from("settings").select("delivery_weekdays").single(),
    supabase.from("closed_dates").select("closed_on, reason").gte("closed_on", monday).lte("closed_on", sunday),
    supabase.from("menu_days").select("menu_date, meal_id, portion_limit, portions_reserved, source").gte("menu_date", monday).lte("menu_date", sunday),
    supabase.from("meals").select("id, name_de, name_en, category, always_available, is_active").is("archived_at", null).order("sort_order"),
  ]);

  const weekdays = settings?.delivery_weekdays ?? [1, 2, 3, 4, 5];
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i)).filter((d) => weekdays.includes(isoWeekday(d)) || (entries ?? []).some((e) => e.menu_date === d && e.source === "planned"));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("intro")}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="icon" aria-label={t("prevWeek")}>
          <Link href={{ pathname: "/admin/menu", query: { week: addDays(monday, -7) } }}>
            <ChevronLeft aria-hidden />
          </Link>
        </Button>
        <p className="min-w-44 text-center font-semibold">{t("week", { date: formatDate(monday) })}</p>
        <Button asChild variant="outline" size="icon" aria-label={t("nextWeek")}>
          <Link href={{ pathname: "/admin/menu", query: { week: addDays(monday, 7) } }}>
            <ChevronRight aria-hidden />
          </Link>
        </Button>
        {monday !== startOfIsoWeek(defaultWeek) && (
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/menu">{t("thisWeek")}</Link>
          </Button>
        )}
      </div>
      <WeekPlanner
        monday={monday}
        days={days}
        closed={Object.fromEntries((closed ?? []).map((c) => [c.closed_on, c.reason ?? ""]))}
        entries={(entries ?? []).filter((e) => e.source === "planned")}
        meals={(meals ?? []).filter((m) => m.is_active && !m.always_available)}
        alwaysNames={(meals ?? []).filter((m) => m.is_active && m.always_available).map((m) => (locale === "en" ? m.name_en : m.name_de))}
      />
    </div>
  );
}
