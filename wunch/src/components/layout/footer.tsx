import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getSettings } from "@/lib/data/settings";
import { Logo } from "./logo";

export async function Footer() {
  const t = await getTranslations("footer");
  const nav = await getTranslations("nav");
  const settings = await getSettings();
  return (
    <footer className="mt-16 border-t bg-secondary/60">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 text-sm sm:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-sm text-muted-foreground">{t("area", { postcodes: settings.delivery_postcodes.join(", ") })}</p>
          <p className="text-xs text-muted-foreground">{t("cookies")}</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 sm:flex-col sm:items-end">
          <Link href="/orders" className="hover:text-primary">
            {nav("orders")}
          </Link>
          <Link href="/impressum" className="hover:text-primary">
            {t("impressum")}
          </Link>
          <Link href="/agb" className="hover:text-primary">
            {t("agb")}
          </Link>
          <Link href="/datenschutz" className="hover:text-primary">
            {t("privacy")}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
