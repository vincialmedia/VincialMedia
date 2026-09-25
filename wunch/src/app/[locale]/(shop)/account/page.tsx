import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ProfileForm } from "@/components/account/profile-form";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getProfile, requireUser } from "@/lib/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("title"), robots: { index: false } };
}

export default async function AccountPage({ params }: PageProps<"/[locale]/account">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const user = await requireUser(locale, locale === "en" ? "/en/account" : "/account");
  const profile = await getProfile(user.id);
  const t = await getTranslations("account");
  const tn = await getTranslations("nav");

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">{t("title")}</h1>
          <p className="text-muted-foreground">{user.email}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/orders">{tn("orders")}</Link>
          </Button>
          <form action={`/auth/signout?locale=${locale}`} method="post">
            <Button type="submit" variant="ghost">
              {t("logout")}
            </Button>
          </form>
        </div>
      </div>
      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        <h2 className="text-xl font-bold">{t("details")}</h2>
        <p className="mb-5 text-sm text-muted-foreground">{t("detailsHint")}</p>
        {profile && <ProfileForm profile={profile} />}
      </section>
      <p className="text-sm">
        <Link href="/reset-password" className="font-medium text-primary hover:underline">
          {t("password")}
        </Link>
      </p>
    </div>
  );
}
