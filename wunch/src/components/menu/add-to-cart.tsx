"use client";

import { Check, Minus, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatDayShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { type CartLine, MAX_QUANTITY, cartActions, useCart } from "../cart/cart-store";

type MealForCart = Omit<CartLine, "quantity">;

export function AddToCartButton({
  meal,
  date,
  disabled,
  maxQuantity,
  withQuantity = false,
  className,
}: {
  meal: MealForCart;
  date: string;
  disabled?: boolean;
  maxQuantity?: number | null;
  withQuantity?: boolean;
  className?: string;
}) {
  const t = useTranslations("menu");
  const tc = useTranslations("cart");
  const tMeal = useTranslations("meal");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const cart = useCart();
  const [quantity, setQuantity] = useState(1);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const name = locale === "en" ? meal.nameEn : meal.nameDe;
  const limit = Math.min(MAX_QUANTITY, maxQuantity ?? MAX_QUANTITY);

  function add() {
    cartActions.add(date, meal, quantity);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1500);
    toast.success(t("added", { name }));
  }

  function onClick() {
    if (cart.lines.length > 0 && cart.date && cart.date !== date) {
      setConfirmOpen(true);
      return;
    }
    add();
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {withQuantity && (
        <div className="flex items-center rounded-full border bg-card" role="group" aria-label={tMeal("quantity")}>
          <Button type="button" variant="ghost" size="icon" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label={tc("decrease")} disabled={disabled || quantity <= 1}>
            <Minus aria-hidden />
          </Button>
          <span className="w-6 text-center font-semibold tabular-nums" aria-live="polite">
            {quantity}
          </span>
          <Button type="button" variant="ghost" size="icon" onClick={() => setQuantity((q) => Math.min(limit, q + 1))} aria-label={tc("increase")} disabled={disabled || quantity >= limit}>
            <Plus aria-hidden />
          </Button>
        </div>
      )}
      <Button type="button" onClick={onClick} disabled={disabled} aria-label={t("addNamed", { name })} className={withQuantity ? "flex-1" : undefined} size={withQuantity ? "lg" : "default"}>
        {justAdded ? <Check aria-hidden /> : <Plus aria-hidden />}
        {t("add")}
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent closeLabel={tCommon("close")}>
          <DialogTitle>{tc("switchDateTitle")}</DialogTitle>
          <DialogDescription className="mt-2">
            {tc("switchDateBody", {
              cartDate: cart.date ? formatDayShort(cart.date, locale) : "",
              newDate: formatDayShort(date, locale),
            })}
          </DialogDescription>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
            <Button
              onClick={() => {
                cartActions.clear();
                add();
                setConfirmOpen(false);
              }}
            >
              {tc("switchDateConfirm")}
            </Button>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {tc("switchDateKeep")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
