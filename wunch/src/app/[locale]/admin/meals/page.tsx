import { Plus } from "lucide-react";
import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MealImage } from "@/components/menu/meal-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireAdminPage } from "@/lib/auth";
import type { Category } from "@/lib/i18n-keys";
import { formatCHF } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin.meals"))("title") };
}

export default async function AdminMealsPage({ params, searchParams }: PageProps<"/[locale]/admin/meals">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  await requireAdminPage(locale, "/admin/meals");
  const { archived } = (await searchParams) as { archived?: string };
  const t = await getTranslations("admin.meals");
  const tm = await getTranslations("menu.categories");
  const supabase = await createClient();
  let query = supabase.from("meals").select("*").order("category").order("sort_order").order("name_de");
  if (archived !== "1") query = query.is("archived_at", null);
  const { data: meals } = await query;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">{t("title")}</h1>
        <div className="flex gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href={{ pathname: "/admin/meals", query: archived === "1" ? {} : { archived: "1" } }}>{archived === "1" ? t("hideArchived") : t("showArchived")}</Link>
          </Button>
          <Button asChild>
            <Link href="/admin/meals/new">
              <Plus aria-hidden />
              {t("new")}
            </Link>
          </Button>
        </div>
      </div>
      {!meals?.length ? (
        <p className="rounded-xl bg-secondary p-6 text-center">{t("empty")}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {meals.map((m) => (
            <li key={m.id}>
              <Link href={`/admin/meals/${m.id}`} className="flex gap-3 rounded-xl border bg-card p-3 hover:border-primary/50">
                <div className="w-24 shrink-0 overflow-hidden rounded-lg">
                  <MealImage path={m.image_path} alt="" sizes="96px" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{locale === "en" ? m.name_en : m.name_de}</p>
                  <p className="text-sm text-muted-foreground">
                    {tm(m.category as Category)} · {formatCHF(m.price_rappen)}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {!m.is_active && <Badge variant="muted">{t("inactive")}</Badge>}
                    {m.archived_at && <Badge variant="destructive">{t("archivedBadge")}</Badge>}
                    {m.always_available && <Badge variant="green">{t("alwaysBadge")}</Badge>}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
