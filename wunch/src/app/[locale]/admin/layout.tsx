import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Logo } from "@/components/layout/logo";
import { Link } from "@/i18n/navigation";
import { requireAdminPage } from "@/lib/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: { default: t("title"), template: `%s · ${t("title")}` }, robots: { index: false, follow: false } };
}

export default async function AdminLayout({ children, params }: LayoutProps<"/[locale]/admin">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  await requireAdminPage(locale, locale === "en" ? "/en/admin" : "/admin");
  const t = await getTranslations("admin.nav");

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-7xl space-y-2 px-4 pt-2 pb-2">
          <div className="flex items-center gap-3">
            <Logo href="/admin" />
            <span className="rounded-full bg-foreground px-2 py-0.5 text-xs font-bold text-background">Admin</span>
            <div className="ml-auto flex items-center gap-2">
              <Suspense>
                <LanguageSwitcher />
              </Suspense>
              <Link href="/" className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:inline">
                {t("shop")}
              </Link>
            </div>
          </div>
          <AdminNav />
        </div>
      </header>
      <main id="main" className="mx-auto max-w-7xl px-4 py-5 pb-24">
        {children}
      </main>
    </div>
  );
}
