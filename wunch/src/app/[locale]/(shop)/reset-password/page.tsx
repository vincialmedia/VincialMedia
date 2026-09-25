import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { NewPasswordForm } from "./new-password-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("newPasswordTitle"), robots: { index: false } };
}

export default async function ResetPasswordPage({ params }: PageProps<"/[locale]/reset-password">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  await requireUser(locale, locale === "en" ? "/en/reset-password" : "/reset-password");
  const t = await getTranslations("auth");
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="rounded-2xl border bg-card p-6 sm:p-8">
        <h1 className="mb-4 text-xl font-bold">{t("newPasswordTitle")}</h1>
        <NewPasswordForm />
      </div>
    </div>
  );
}
