"use client";

import { ShoppingBag } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cartCount, useCart } from "./cart-store";

export function CartButton() {
  const cart = useCart();
  const count = cartCount(cart);
  const t = useTranslations("nav");
  return (
    <Link
      href="/cart"
      className="relative inline-flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
      aria-label={t("cartCount", { count })}
    >
      <ShoppingBag className="size-5" aria-hidden />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 flex min-w-5 items-center justify-center rounded-full bg-foreground px-1 text-[11px] font-bold text-background" aria-hidden>
          {count}
        </span>
      )}
    </Link>
  );
}
