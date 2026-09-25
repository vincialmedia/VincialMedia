"use client";

import { AlertTriangle, Minus, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { MealImageClient } from "@/components/menu/meal-image-client";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Link } from "@/i18n/navigation";
import { type CartCheck, checkCart } from "@/lib/actions/cart";
import { formatDayLong, formatDayShort } from "@/lib/format";
import { formatCHF } from "@/lib/money";
import { MAX_QUANTITY, cartActions, cartSubtotal, useCart, useCartHydrated } from "@/components/cart/cart-store";

export function CartView() {
  const t = useTranslations("cart");
  const locale = useLocale();
  const cart = useCart();
  const hydrated = useCartHydrated();
  const [check, setCheck] = useState<CartCheck | null>(null);
  const [, startTransition] = useTransition();
  const mealKey = cart.lines.map((l) => l.mealId).join(",");

  useEffect(() => {
    if (!cart.lines.length) return;
    startTransition(async () => {
      const result = await checkCart({ date: cart.date, mealIds: cart.lines.map((l) => l.mealId) });
      setCheck(result);
      // keep displayed prices and names current
      for (const line of cart.lines) {
        const fresh = result.items[line.mealId];
        if (fresh && (fresh.priceRappen !== line.priceRappen || fresh.imagePath !== line.imagePath)) {
          cartActions.add(cart.date!, { ...line, priceRappen: fresh.priceRappen, imagePath: fresh.imagePath, nameDe: fresh.nameDe, nameEn: fresh.nameEn }, 0);
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-check when the date or the set of meals changes
  }, [cart.date, mealKey]);

  if (!hydrated) return <div className="h-40 animate-pulse rounded-xl bg-secondary" />;

  if (!cart.lines.length) {
    return (
      <div className="rounded-xl bg-secondary p-8 text-center">
        <p className="mb-4">{t("empty")}</p>
        <Button asChild>
          <Link href="/">{t("toMenu")}</Link>
        </Button>
      </div>
    );
  }

  const dateGone = check && !check.dateOk;
  const problems = check
    ? cart.lines.filter((l) => {
        const item = check.items[l.mealId];
        return !item || item.soldOut || (item.portionsLeft !== null && l.quantity > item.portionsLeft);
      })
    : [];
  const canCheckout = !!check && check.dateOk && problems.length === 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary px-4 py-3">
        <p className="font-semibold">{cart.date ? t("forDate", { date: formatDayLong(cart.date, locale) }) : ""}</p>
        {check && check.orderableDates.length > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <span className="sr-only">{t("changeDate")}</span>
            <Select
              className="h-9 w-auto"
              value={check.dateOk ? cart.date ?? "" : ""}
              onChange={(e) => e.target.value && cartActions.setDate(e.target.value)}
              aria-label={t("changeDate")}
            >
              {!check.dateOk && <option value="">{t("changeDate")}</option>}
              {check.orderableDates.map((d) => (
                <option key={d} value={d}>
                  {formatDayShort(d, locale)}
                </option>
              ))}
            </Select>
          </label>
        )}
      </div>

      {dateGone && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("dateGone", { date: cart.date ? formatDayShort(cart.date, locale) : "" })}
        </p>
      )}

      <ul className="divide-y rounded-xl border bg-card">
        {cart.lines.map((line) => {
          const name = locale === "en" ? line.nameEn : line.nameDe;
          const item = check?.items[line.mealId];
          const unavailable = check?.dateOk && !item;
          const soldOut = item?.soldOut;
          const max = item?.portionsLeft ?? MAX_QUANTITY;
          const tooMany = item && item.portionsLeft !== null && line.quantity > item.portionsLeft && !soldOut;
          return (
            <li key={line.mealId} className="flex gap-3 p-3 sm:p-4">
              <div className="w-20 shrink-0 overflow-hidden rounded-lg sm:w-24">
                <MealImageClient path={line.imagePath} alt="" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold leading-snug">{name}</p>
                  <p className="shrink-0 font-semibold tabular-nums">{formatCHF(line.priceRappen * line.quantity)}</p>
                </div>
                {(unavailable || soldOut || tooMany) && (
                  <p className="text-sm font-medium text-destructive">
                    {soldOut ? t("soldOut") : tooMany ? t("onlyLeft", { count: item!.portionsLeft! }) : t("unavailable", { date: formatDayShort(cart.date!, locale) })}
                  </p>
                )}
                <div className="flex items-center justify-between">
                  <div className="flex items-center rounded-full border">
                    <Button variant="ghost" size="icon" className="size-9" onClick={() => cartActions.setQuantity(line.mealId, line.quantity - 1)} aria-label={t("decrease")}>
                      <Minus aria-hidden />
                    </Button>
                    <span className="w-6 text-center text-sm font-semibold tabular-nums">{line.quantity}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9"
                      onClick={() => cartActions.setQuantity(line.mealId, line.quantity + 1)}
                      disabled={line.quantity >= Math.min(MAX_QUANTITY, max)}
                      aria-label={t("increase")}
                    >
                      <Plus aria-hidden />
                    </Button>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => cartActions.remove(line.mealId)} aria-label={t("remove", { name })}>
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between px-1 text-lg">
        <span className="font-semibold">{t("subtotal")}</span>
        <span className="font-heading font-extrabold tabular-nums">{formatCHF(cartSubtotal(cart))}</span>
      </div>

      <Button asChild size="lg" className="w-full" aria-disabled={!canCheckout}>
        {canCheckout ? (
          <Link href="/checkout">{t("checkout")}</Link>
        ) : (
          <span className="pointer-events-none opacity-50">{t("checkout")}</span>
        )}
      </Button>
      <p className="text-center">
        <Link href={{ pathname: "/", query: cart.date ? { date: cart.date } : {} }} className="text-sm font-medium text-primary hover:underline">
          {t("toMenu")}
        </Link>
      </p>
    </div>
  );
}
