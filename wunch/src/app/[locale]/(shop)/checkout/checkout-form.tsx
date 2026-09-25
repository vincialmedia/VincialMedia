"use client";

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
// "pure" = Stripe.js is only loaded when the payment step needs it
import type { Stripe } from "@stripe/stripe-js";
import { loadStripe } from "@stripe/stripe-js/pure";
import { Loader2, Lock, ShieldCheck, Tag, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { cartActions, useCart, useCartHydrated } from "@/components/cart/cart-store";
import { MealImageClient } from "@/components/menu/meal-image-client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link, useRouter } from "@/i18n/navigation";
import { type PlaceOrderResponse, emulatorConfirm, placeOrder, quoteCheckout } from "@/lib/actions/checkout";
import { formatDayShort, formatSlot, formatVatRate } from "@/lib/format";
import type { ErrorKey } from "@/lib/i18n-keys";
import { formatCHF, parseCHF, rappenToInput } from "@/lib/money";
import type { Quote, QuoteError } from "@/lib/orders/quote";
import { cn } from "@/lib/utils";
import { type DeliveryDetails, deliveryDetailsSchema } from "@/lib/validation";

type Tip = { kind: "none" } | { kind: "percent"; percent: number } | { kind: "custom"; rappen: number };
type Details = { [K in keyof DeliveryDetails]: string };

const EMPTY_DETAILS: Details = { fullName: "", company: "", street: "", postcode: "", city: "Schlieren", floorRoom: "", phone: "", deliveryNote: "" };

let stripePromise: Promise<Stripe | null> | null = null;
function getStripeJs(key: string) {
  stripePromise ??= loadStripe(key);
  return stripePromise;
}

export function CheckoutForm({
  userEmail,
  profile,
  postcodes,
  tipPercentages,
  emulator,
  publishableKey,
}: {
  userEmail: string | null;
  profile: Details | null;
  postcodes: string[];
  tipPercentages: number[];
  emulator: boolean;
  publishableKey: string;
}) {
  const t = useTranslations("checkout");
  const te = useTranslations("errors");
  const tCommon = useTranslations("common");
  const tCart = useTranslations("cart");
  const tAuth = useTranslations("auth");
  const locale = useLocale();
  const cart = useCart();
  const hydrated = useCartHydrated();

  const [slotId, setSlotId] = useState<string | null>(null);
  const [details, setDetails] = useState<Details>(profile ?? EMPTY_DETAILS);
  const [invalid, setInvalid] = useState<string[]>([]);
  const [saveToProfile, setSaveToProfile] = useState(true);
  const [couponInput, setCouponInput] = useState("");
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [couponMessage, setCouponMessage] = useState<string | null>(null);
  const [tip, setTip] = useState<Tip>({ kind: "none" });
  const [customTip, setCustomTip] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<QuoteError | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const requestId = useRef(0);

  const translateError = useCallback(
    (e: QuoteError) => {
      const params = { ...(e.params ?? {}) } as Record<string, string | number>;
      if (locale === "en" && params.mealEn) params.meal = params.mealEn;
      if (e.code === "postcode_not_served") params.postcodes = postcodes.join(", ");
      const key = (te.has(e.code as ErrorKey) ? e.code : "generic") as ErrorKey;
      return te(key, params as never);
    },
    [locale, postcodes, te],
  );

  const items = useMemo(() => cart.lines.map((l) => ({ mealId: l.mealId, quantity: l.quantity })), [cart.lines]);
  const date = cart.date;

  // Live quote from the server whenever something that affects the price changes
  useEffect(() => {
    if (!hydrated || !date || items.length === 0) return;
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      const res = await quoteCheckout({ date, slotId, items, couponCode, tip });
      if (id !== requestId.current) return;
      if (!res.ok) {
        setQuoteError(res.error);
        return;
      }
      const q = res.quote;
      setQuote(q);
      setQuoteError(q.error);
      if (q.error?.code === "date_unavailable" && q.dates[0]) {
        cartActions.setDate(q.dates[0]);
        return;
      }
      if (couponCode && q.couponError) {
        setCouponMessage(translateError(q.couponError));
        setCouponCode(null);
      }
      const current = q.slots.find((s) => s.id === slotId);
      if (!current || current.availability !== "available") {
        const first = q.slots.find((s) => s.availability === "available");
        if (first && first.id !== slotId) setSlotId(first.id);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [hydrated, date, slotId, items, couponCode, tip, translateError]);

  if (!hydrated) return <div className="h-64 animate-pulse rounded-xl bg-secondary" />;
  if (!cart.lines.length || !date) {
    return (
      <div className="rounded-xl bg-secondary p-8 text-center">
        <p className="mb-4">{t("emptyCart")}</p>
        <Button asChild>
          <Link href="/">{tCart("toMenu")}</Link>
        </Button>
      </div>
    );
  }

  const b = quote?.breakdown ?? null;
  const total = b?.totalRappen ?? 0;
  const postcodeBad = details.postcode.length === 4 && !postcodes.includes(details.postcode);

  function update<K extends keyof Details>(key: K, value: string) {
    setDetails((d) => ({ ...d, [key]: value }));
    setInvalid((f) => f.filter((x) => x !== key));
  }

  /** Validate everything we can before touching the payment. */
  function validate(): boolean {
    setPayError(null);
    const parsed = deliveryDetailsSchema.safeParse(details);
    const fields = parsed.success ? [] : parsed.error.issues.map((i) => String(i.path[0]));
    if (postcodeBad) fields.push("postcode");
    setInvalid(fields);
    if (fields.length) {
      setPayError(postcodeBad ? t("postcodeOutside", { postcodes: postcodes.join(", ") }) : te("invalid_input"));
      document.getElementById(`co-${fields[0]}`)?.focus();
      return false;
    }
    if (!userEmail) {
      setPayError(te("not_signed_in"));
      return false;
    }
    if (!quote || !b || quote.error || !slotId) {
      setPayError(quote?.error ? translateError(quote.error) : te("generic"));
      return false;
    }
    return true;
  }

  async function createOrder(): Promise<PlaceOrderResponse> {
    const res = await placeOrder({
      date,
      slotId,
      items,
      couponCode,
      tip,
      details,
      saveToProfile,
      expectedTotalRappen: total,
      locale,
    });
    if (!res.ok) {
      if (res.quote) setQuote(res.quote);
      if (res.fields?.length) setInvalid(res.fields);
      setPayError(translateError(res.error));
    }
    return res;
  }

  const sharedPay = { validate, createOrder, total, onError: setPayError };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="space-y-6">
        {/* 1. Account */}
        <section className="rounded-2xl border bg-card p-5 sm:p-6" aria-labelledby="co-account">
          <h2 id="co-account" className="mb-3 text-lg font-bold">
            {t("account")}
          </h2>
          {userEmail ? (
            <p className="text-sm">{t("signedInAs", { email: userEmail })}</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{tAuth("checkoutIntro")}</p>
              <AuthForm next={locale === "en" ? "/en/checkout" : "/checkout"} initialMode="signup" onSignedIn={() => undefined} />
            </div>
          )}
        </section>

        {/* 2. Delivery day and slot */}
        <section className="rounded-2xl border bg-card p-5 sm:p-6" aria-labelledby="co-delivery">
          <h2 id="co-delivery" className="mb-4 text-lg font-bold">
            {t("delivery")}
          </h2>
          <fieldset className="mb-5">
            <legend className="mb-2 text-sm font-medium">{t("date")}</legend>
            <div className="flex flex-wrap gap-2">
              {(quote?.dates ?? [date]).map((d) => (
                <label
                  key={d}
                  className={cn(
                    "cursor-pointer rounded-xl border px-3 py-2 text-sm font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
                    d === date ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/40",
                  )}
                >
                  <input type="radio" name="date" value={d} checked={d === date} onChange={() => cartActions.setDate(d)} className="sr-only" />
                  {formatDayShort(d, locale)}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">{t("slot")}</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(quote?.slots ?? []).map((s) => {
                const disabled = s.availability !== "available";
                return (
                  <label
                    key={s.id}
                    className={cn(
                      "flex cursor-pointer items-center justify-between rounded-xl border px-3 py-3 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
                      s.id === slotId && "border-primary bg-primary/5 ring-1 ring-primary",
                      disabled && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <input type="radio" name="slot" value={s.id} checked={s.id === slotId} disabled={disabled} onChange={() => setSlotId(s.id)} className="accent-[var(--primary)]" />
                      <span className="font-semibold tabular-nums">{formatSlot(s.startsAt, s.endsAt)}</span>
                    </span>
                    {disabled && <span className="text-xs text-muted-foreground">{s.availability === "full" ? t("slotFull") : t("slotStarted")}</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>
        </section>

        {/* 3. Address */}
        <section className="rounded-2xl border bg-card p-5 sm:p-6" aria-labelledby="co-details">
          <h2 id="co-details" className="mb-4 text-lg font-bold">
            {t("details")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="fullName" label={t("fullName")} value={details.fullName} invalid={invalid} onChange={update} autoComplete="name" className="sm:col-span-2" />
            <Field id="company" label={`${t("company")} (${tCommon("optional")})`} value={details.company} invalid={invalid} onChange={update} autoComplete="organization" className="sm:col-span-2" />
            <Field id="street" label={t("street")} value={details.street} invalid={invalid} onChange={update} autoComplete="street-address" className="sm:col-span-2" />
            <div className="space-y-1.5">
              <Field id="postcode" label={t("postcode")} value={details.postcode} invalid={postcodeBad ? [...invalid, "postcode"] : invalid} onChange={update} autoComplete="postal-code" inputMode="numeric" maxLength={4} describedBy={postcodeBad ? "co-postcode-error" : undefined} />
              {postcodeBad && (
                <p id="co-postcode-error" role="alert" className="text-sm text-destructive">
                  {t("postcodeOutside", { postcodes: postcodes.join(", ") })}
                </p>
              )}
            </div>
            <Field id="city" label={t("city")} value={details.city} invalid={invalid} onChange={update} autoComplete="address-level2" />
            <Field id="floorRoom" label={`${t("floorRoom")} (${tCommon("optional")})`} value={details.floorRoom} invalid={invalid} onChange={update} />
            <Field id="phone" label={t("phone")} value={details.phone} invalid={invalid} onChange={update} autoComplete="tel" type="tel" inputMode="tel" />
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="co-deliveryNote">{`${t("note")} (${tCommon("optional")})`}</Label>
              <Textarea id="co-deliveryNote" value={details.deliveryNote} onChange={(e) => update("deliveryNote", e.target.value)} placeholder={t("notePlaceholder")} maxLength={500} />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <Checkbox checked={saveToProfile} onChange={(e) => setSaveToProfile(e.target.checked)} />
              {t("saveProfile")}
            </label>
          </div>
        </section>
      </div>

      {/* Summary, coupon, tip, payment */}
      <aside className="space-y-4" aria-labelledby="co-summary">
        <section className="rounded-2xl border bg-card p-5 sm:p-6">
          <h2 id="co-summary" className="mb-4 text-lg font-bold">
            {t("summary")}
          </h2>
          <ul className="mb-4 space-y-3">
            {cart.lines.map((l) => (
              <li key={l.mealId} className="flex items-center gap-3 text-sm">
                <div className="w-14 shrink-0 overflow-hidden rounded-md">
                  <MealImageClient path={l.imagePath} alt="" />
                </div>
                <span className="flex-1">
                  {l.quantity} × {locale === "en" ? l.nameEn : l.nameDe}
                </span>
                <span className="tabular-nums">{formatCHF(l.priceRappen * l.quantity)}</span>
              </li>
            ))}
          </ul>

          {/* Coupon */}
          <div className="mb-4 border-t pt-4">
            {couponCode && quote?.coupon ? (
              <div className="flex items-center justify-between rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
                <span className="flex items-center gap-2 font-medium">
                  <Tag className="size-4" aria-hidden />
                  {t("couponApplied", { code: quote.coupon.code })}
                </span>
                <Button variant="ghost" size="icon" className="size-8 text-accent" onClick={() => setCouponCode(null)} aria-label={t("removeCoupon")}>
                  <X aria-hidden />
                </Button>
              </div>
            ) : (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setCouponMessage(null);
                  if (couponInput.trim()) setCouponCode(couponInput.trim());
                }}
              >
                <Label htmlFor="co-coupon" className="sr-only">
                  {t("coupon")}
                </Label>
                <Input id="co-coupon" placeholder={t("couponPlaceholder")} value={couponInput} onChange={(e) => setCouponInput(e.target.value)} autoCapitalize="characters" autoComplete="off" aria-describedby={couponMessage ? "co-coupon-msg" : undefined} />
                <Button type="submit" variant="outline">
                  {t("applyCoupon")}
                </Button>
              </form>
            )}
            {couponMessage && (
              <p id="co-coupon-msg" role="alert" className="mt-2 text-sm text-destructive">
                {couponMessage}
              </p>
            )}
          </div>

          {/* Tip */}
          <fieldset className="mb-4 border-t pt-4">
            <legend className="mb-2 text-sm font-medium">{t("tip")}</legend>
            <div className="flex flex-wrap gap-2">
              {[{ kind: "none" as const }, ...tipPercentages.map((p) => ({ kind: "percent" as const, percent: p })), { kind: "custom" as const, rappen: 0 }].map((option) => {
                const active = option.kind === tip.kind && (option.kind !== "percent" || (tip.kind === "percent" && tip.percent === option.percent));
                const label = option.kind === "none" ? t("tipNone") : option.kind === "percent" ? `${option.percent} %` : t("tipCustom");
                return (
                  <label key={label} className={cn("cursor-pointer rounded-full border px-3 py-1.5 text-sm font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring", active ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/40")}>
                    <input
                      type="radio"
                      name="tip"
                      className="sr-only"
                      checked={active}
                      onChange={() => {
                        if (option.kind === "custom") setTip({ kind: "custom", rappen: parseCHF(customTip) ?? 0 });
                        else setTip(option);
                      }}
                    />
                    {label}
                  </label>
                );
              })}
            </div>
            {tip.kind === "custom" && (
              <div className="mt-2 flex items-center gap-2">
                <Label htmlFor="co-tip" className="text-sm">
                  {t("tipCustomLabel")}
                </Label>
                <Input
                  id="co-tip"
                  inputMode="decimal"
                  className="w-28"
                  value={customTip}
                  placeholder="2.00"
                  onChange={(e) => setCustomTip(e.target.value)}
                  onBlur={() => {
                    const r = parseCHF(customTip);
                    setTip({ kind: "custom", rappen: r ?? 0 });
                    if (r !== null) setCustomTip(rappenToInput(r));
                  }}
                />
              </div>
            )}
          </fieldset>

          {/* Totals */}
          <dl className="space-y-1.5 border-t pt-4 text-sm" aria-live="polite">
            <Row label={t("meals")} value={b ? formatCHF(b.subtotalRappen) : "…"} />
            {b && b.discountRappen > 0 && <Row label={t("discount", { code: quote?.coupon?.code ?? "" })} value={`−${formatCHF(b.discountRappen)}`} className="text-accent" />}
            <Row label={t("deliveryFee")} value={b ? (b.deliveryFeeRappen ? formatCHF(b.deliveryFeeRappen) : t("free")) : "…"} />
            {b && b.tipRappen > 0 && <Row label={t("tipLine")} value={formatCHF(b.tipRappen)} />}
            <div className="flex items-baseline justify-between border-t pt-2 text-lg font-bold">
              <dt>{t("total")}</dt>
              <dd className="font-heading tabular-nums" data-testid="checkout-total">
                {b ? formatCHF(b.totalRappen) : "…"}
              </dd>
            </div>
            {b && b.vatRateBp > 0 && <Row label={t("vatIncluded", { rate: formatVatRate(b.vatRateBp) })} value={formatCHF(b.vatRappen)} className="text-xs text-muted-foreground" />}
          </dl>
          {quoteError && quoteError.code !== "date_unavailable" && (
            <p role="alert" className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="quote-error">
              {translateError(quoteError)}
            </p>
          )}
        </section>

        <section className="rounded-2xl border bg-card p-5 sm:p-6" aria-labelledby="co-payment">
          <h2 id="co-payment" className="mb-3 flex items-center gap-2 text-lg font-bold">
            <Lock className="size-4" aria-hidden />
            {t("payment")}
          </h2>
          <div className="mb-4 flex gap-3 rounded-xl bg-accent-soft p-3 text-sm text-accent">
            <ShieldCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">{t("holdTitle")}</p>
              <p>{t("holdNote")}</p>
            </div>
          </div>

          {emulator ? (
            <EmulatorPay {...sharedPay} />
          ) : publishableKey.startsWith("pk_") && total >= 50 ? (
            <Elements
              stripe={getStripeJs(publishableKey)}
              options={{
                mode: "payment",
                amount: total,
                currency: "chf",
                captureMethod: "manual",
                paymentMethodTypes: ["card"],
                locale: locale === "en" ? "en" : "de",
                appearance: {
                  theme: "stripe",
                  variables: { colorPrimary: "#c73e1d", colorText: "#1e1a16", borderRadius: "10px", fontFamily: "Inter, system-ui, sans-serif" },
                },
              }}
            >
              <StripePay {...sharedPay} />
            </Elements>
          ) : (
            <p className="text-sm text-muted-foreground">{total >= 50 ? t("stripeNotConfigured") : "…"}</p>
          )}

          {payError && (
            <p role="alert" className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="pay-error">
              {payError}
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            {t.rich("legal", {
              agb: (chunks) => (
                <Link href="/agb" className="underline">
                  {chunks}
                </Link>
              ),
              privacy: (chunks) => (
                <Link href="/datenschutz" className="underline">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </section>
      </aside>
    </div>
  );
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("flex justify-between gap-3", className)}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  invalid,
  onChange,
  className,
  describedBy,
  ...rest
}: {
  id: keyof Details;
  label: string;
  value: string;
  invalid: string[];
  onChange: (key: keyof Details, value: string) => void;
  className?: string;
  describedBy?: string;
} & Omit<React.ComponentProps<"input">, "onChange" | "value" | "id">) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={`co-${id}`}>{label}</Label>
      <Input id={`co-${id}`} name={id} value={value} onChange={(e) => onChange(id, e.target.value)} aria-invalid={invalid.includes(id) || undefined} aria-describedby={describedBy} {...rest} />
    </div>
  );
}

type PayProps = {
  validate: () => boolean;
  createOrder: () => Promise<PlaceOrderResponse>;
  total: number;
  onError: (message: string | null) => void;
};

/** Real Stripe: Payment Element (cards, Apple Pay, Google Pay), deferred intent, manual capture. */
function StripePay({ validate, createOrder, total, onError }: PayProps) {
  const t = useTranslations("checkout");
  const te = useTranslations("errors");
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const locale = useLocale();
  const [busy, setBusy] = useState(false);

  async function pay() {
    if (!stripe || !elements) return;
    if (!validate()) return;
    setBusy(true);
    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        onError(submitError.message ?? te("generic"));
        return;
      }
      const res = await createOrder();
      if (!res.ok) return;
      const returnUrl = `${window.location.origin}${locale === "en" ? "/en" : ""}/checkout/success?order=${res.orderId}`;
      const { error } = await stripe.confirmPayment({
        elements,
        clientSecret: res.clientSecret,
        confirmParams: { return_url: returnUrl },
        redirect: "if_required",
      });
      if (error) {
        onError(error.message ?? te("payment_declined"));
        return;
      }
      router.push({ pathname: "/checkout/success", query: { order: res.orderId } });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PaymentElement options={{ layout: "tabs", wallets: { applePay: "auto", googlePay: "auto" } }} />
      <Button type="button" size="lg" className="w-full" onClick={pay} disabled={!stripe || busy || total < 50} data-testid="pay-button">
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Lock aria-hidden />}
        {busy ? t("paying") : t("pay", { amount: formatCHF(total) })}
      </Button>
    </div>
  );
}

/** Local testing without Stripe keys: simulated test cards on the Stripe emulator. */
function EmulatorPay({ validate, createOrder, total, onError }: PayProps) {
  const t = useTranslations("checkout");
  const te = useTranslations("errors");
  const router = useRouter();
  const [busy, setBusy] = useState<"success" | "decline" | null>(null);

  async function pay(outcome: "success" | "decline") {
    if (!validate()) return;
    setBusy(outcome);
    try {
      const res = await createOrder();
      if (!res.ok) return;
      const confirmed = await emulatorConfirm(res.clientSecret, outcome);
      if (!confirmed.ok) {
        onError(te("payment_declined"));
        return;
      }
      router.push({ pathname: "/checkout/success", query: { order: res.orderId } });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-dashed border-warning/60 bg-warning-soft p-3 text-xs text-warning">
        <p className="font-semibold">{t("emulatorTitle")}</p>
        <p>{t("emulatorNote")}</p>
      </div>
      <Button type="button" size="lg" className="w-full" onClick={() => pay("success")} disabled={busy !== null || total < 50} data-testid="pay-button">
        {busy === "success" ? <Loader2 className="animate-spin" aria-hidden /> : <Lock aria-hidden />}
        {busy === "success" ? t("paying") : t("pay", { amount: formatCHF(total) })}
      </Button>
      <p className="text-center text-xs text-muted-foreground">{t("emulatorSuccess")}</p>
      <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => pay("decline")} disabled={busy !== null || total < 50} data-testid="pay-decline">
        {t("emulatorDecline")}
      </Button>
    </div>
  );
}
