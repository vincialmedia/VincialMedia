import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthForm } from "@/components/auth/auth-form";
import { redirect } from "@/i18n/navigation";
import { getSessionUser } from "@/lib/auth";
import { safeNextPath } from "@/lib/safe-redirect";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("loginTitle"), robots: { index: false } };
}

export default async function LoginPage({ params, searchParams }: PageProps<"/[locale]/login">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const sp = (await searchParams) as { next?: string; error?: string; mode?: string };
  const home = locale === "en" ? "/en" : "/";
  const next = safeNextPath(sp.next, home);
  if (await getSessionUser()) redirect({ href: "/account", locale });
  const t = await getTranslations("auth");

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="rounded-2xl border bg-card p-6 shadow-xs sm:p-8">
        {sp.error === "link" && (
          <p role="alert" className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {t("linkInvalid")}
          </p>
        )}
        <AuthForm next={next} initialMode={sp.mode === "signup" ? "signup" : "login"} />
      </div>
    </div>
  );
}
