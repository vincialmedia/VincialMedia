import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MealForm } from "@/components/admin/meal-form";
import { requireAdminPage } from "@/lib/auth";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin.meals"))("new") };
}

export default async function NewMealPage({ params }: PageProps<"/[locale]/admin/meals/new">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  await requireAdminPage(locale, "/admin/meals/new");
  const t = await getTranslations("admin.meals");
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-extrabold">{t("new")}</h1>
      <MealForm meal={null} />
    </div>
  );
}
