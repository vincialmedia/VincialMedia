import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CouponForm } from "@/components/admin/coupon-form";
import { requireAdminPage } from "@/lib/auth";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin.coupons"))("new") };
}

export default async function NewCouponPage({ params }: PageProps<"/[locale]/admin/coupons/new">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  await requireAdminPage(locale, "/admin/coupons/new");
  const t = await getTranslations("admin.coupons");
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-extrabold">{t("new")}</h1>
      <CouponForm coupon={null} />
    </div>
  );
}
