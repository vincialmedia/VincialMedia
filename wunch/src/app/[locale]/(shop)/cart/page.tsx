import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CartView } from "./cart-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("cart");
  return { title: t("title"), robots: { index: false } };
}

export default async function CartPage({ params }: PageProps<"/[locale]/cart">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const t = await getTranslations("cart");
  return (
    <div className="mx-auto min-h-[85dvh] max-w-2xl px-4 py-6 sm:py-10">
      <h1 className="mb-6 text-3xl font-extrabold">{t("title")}</h1>
      <CartView />
    </div>
  );
}
