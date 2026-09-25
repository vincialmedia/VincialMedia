import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ClosedDatesEditor, SettingsForm, SlotsEditor } from "@/components/admin/settings-forms";
import { requireAdminPage } from "@/lib/auth";
import { zurichNow } from "@/lib/schedule";
import { createAdminClient } from "@/lib/supabase/admin";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin.settings"))("title") };
}

export default async function SettingsPage({ params }: PageProps<"/[locale]/admin/settings">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  await requireAdminPage(locale, "/admin/settings");
  const t = await getTranslations("admin.settings");
  // service role: the private notification address isn't readable with a user session
  const supabase = createAdminClient();
  const [{ data: settings }, { data: slots }, { data: closed }] = await Promise.all([
    supabase.from("settings").select("*").single(),
    supabase.from("delivery_slots").select("*").order("starts_at"),
    supabase.from("closed_dates").select("*").gte("closed_on", zurichNow().date).order("closed_on"),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-extrabold">{t("title")}</h1>
      {settings && <SettingsForm settings={settings} />}
      <SlotsEditor slots={slots ?? []} />
      <ClosedDatesEditor dates={closed ?? []} />
    </div>
  );
}
