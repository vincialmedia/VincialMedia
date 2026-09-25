import { ShieldCheck, UserRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { CartButton } from "@/components/cart/cart-button";
import { Link } from "@/i18n/navigation";
import { getSessionUser, isAdminEmail } from "@/lib/auth";
import { LanguageSwitcher } from "./language-switcher";
import { Logo } from "./logo";

export async function Header() {
  const t = await getTranslations("nav");
  const user = await getSessionUser();
  const admin = user ? isAdminEmail(user.email) : false;

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <Logo />
        <nav aria-label={t("main")} className="ml-6 hidden items-center gap-5 text-sm font-medium md:flex">
          <Link href="/" className="hover:text-primary">
            {t("menu")}
          </Link>
          {user && (
            <Link href="/orders" className="hover:text-primary">
              {t("orders")}
            </Link>
          )}
          {admin && (
            <Link href="/admin" className="inline-flex items-center gap-1 hover:text-primary">
              <ShieldCheck className="size-4" aria-hidden />
              {t("admin")}
            </Link>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Suspense>
            <LanguageSwitcher />
          </Suspense>
          {admin && (
            <Link href="/admin" className="inline-flex size-11 items-center justify-center rounded-full hover:bg-secondary md:hidden" aria-label={t("admin")}>
              <ShieldCheck className="size-5" aria-hidden />
            </Link>
          )}
          <Link
            href={user ? "/account" : "/login"}
            className="inline-flex size-11 items-center justify-center rounded-full hover:bg-secondary"
            aria-label={user ? t("account") : t("login")}
          >
            <UserRound className="size-5" aria-hidden />
          </Link>
          <CartButton />
        </div>
      </div>
    </header>
  );
}
