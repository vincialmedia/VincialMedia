import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getProfile, getSessionUser } from "@/lib/auth";
import { getSettings } from "@/lib/data/settings";
import { env } from "@/lib/env";
import { isEmulator } from "@/lib/stripe/server";
import { CheckoutForm } from "./checkout-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("checkout");
  return { title: t("title"), robots: { index: false } };
}

export default async function CheckoutPage({ params }: PageProps<"/[locale]/checkout">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const t = await getTranslations("checkout");
  const user = await getSessionUser();
  const profile = user ? await getProfile(user.id) : null;
  const settings = await getSettings();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
      <h1 className="mb-6 text-3xl font-extrabold">{t("title")}</h1>
      {/* keyed by user: after an inline login the form remounts with the profile filled in */}
      <CheckoutForm
        key={user?.id ?? "guest"}
        userEmail={user?.email ?? null}
        profile={
          profile
            ? {
                fullName: profile.full_name ?? "",
                company: profile.company ?? "",
                street: profile.street ?? "",
                postcode: profile.postcode ?? "",
                city: profile.city ?? "Schlieren",
                floorRoom: profile.floor_room ?? "",
                phone: profile.phone ?? "",
                deliveryNote: profile.delivery_note ?? "",
              }
            : null
        }
        postcodes={settings.delivery_postcodes}
        tipPercentages={settings.tip_percentages}
        emulator={isEmulator()}
        publishableKey={env().NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY}
      />
    </div>
  );
}
