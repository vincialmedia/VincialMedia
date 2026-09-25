import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal");
  return { title: t("privacyTitle") };
}

// Placeholder: Vince writes the real text before launch.
export default async function Page({ params }: PageProps<"/[locale]/datenschutz">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const t = await getTranslations("legal");
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-4 text-3xl font-extrabold">{t("privacyTitle")}</h1>
      <p className="rounded-xl bg-warning-soft p-4 text-warning">{t("placeholder")}</p>
    </div>
  );
}
