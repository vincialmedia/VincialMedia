import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { MealForm } from "@/components/admin/meal-form";
import { requireAdminPage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/validation";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin.meals"))("edit") };
}

export default async function EditMealPage({ params }: PageProps<"/[locale]/admin/meals/[id]">) {
  const { locale, id } = (await params) as { locale: Locale; id: string };
  setRequestLocale(locale);
  await requireAdminPage(locale, `/admin/meals/${id}`);
  if (!UUID_RE.test(id)) notFound();
  const supabase = await createClient();
  const { data: meal } = await supabase.from("meals").select("*").eq("id", id).maybeSingle();
  if (!meal) notFound();
  const t = await getTranslations("admin.meals");
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-extrabold">{t("edit")}</h1>
      <MealForm meal={meal} />
    </div>
  );
}
