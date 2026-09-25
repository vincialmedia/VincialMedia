import { getTranslations } from "next-intl/server";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";

export default async function ShopLayout({ children }: LayoutProps<"/[locale]">) {
  const t = await getTranslations("common");
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-card focus:px-4 focus:py-2">
        {t("skipToContent")}
      </a>
      <Header />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
}
