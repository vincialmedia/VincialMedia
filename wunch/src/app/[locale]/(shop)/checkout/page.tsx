import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getProfile, getSessionUser } from "@/lib/auth";
import { getClosedDates, getSettings, getSlots, toCalendarSettings } from "@/lib/data/settings";
import { env } from "@/lib/env";
import { getOrderableDates, zurichNow } from "@/lib/schedule";
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
  // Render dates and slots on the server so the form doesn't jump when the live quote arrives
  const now = new Date();
  const dates = getOrderableDates(now, toCalendarSettings(settings), await getClosedDates(zurichNow(now).date));
  const slots = (await getSlots()).filter((s) => s.isActive).map((s) => ({ id: s.id, startsAt: s.startsAt, endsAt: s.endsAt, availability: "available" as const }));

  return (
    <div className="mx-auto min-h-[85dvh] max-w-6xl px-4 py-6 sm:py-10">
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
        initialDates={dates}
        initialSlots={slots}
        postcodes={settings.delivery_postcodes}
        tipPercentages={settings.tip_percentages}
        emulator={isEmulator()}
        publishableKey={env().NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY}
      />
    </div>
  );
}
