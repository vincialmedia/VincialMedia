import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { CouponForm } from "@/components/admin/coupon-form";
import { requireAdminPage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/validation";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin.coupons"))("edit") };
}

export default async function EditCouponPage({ params }: PageProps<"/[locale]/admin/coupons/[id]">) {
  const { locale, id } = (await params) as { locale: Locale; id: string };
  setRequestLocale(locale);
  await requireAdminPage(locale, `/admin/coupons/${id}`);
  if (!UUID_RE.test(id)) notFound();
  const supabase = await createClient();
  const { data: coupon } = await supabase.from("coupons").select("*").eq("id", id).maybeSingle();
  if (!coupon) notFound();
  const t = await getTranslations("admin.coupons");
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-extrabold">{t("edit")}</h1>
      <CouponForm coupon={coupon} />
    </div>
  );
}
