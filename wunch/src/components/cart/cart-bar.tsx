"use client";

import { ShoppingBag } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { formatCHF } from "@/lib/money";
import { cartCount, cartSubtotal, useCart } from "./cart-store";

/** Sticky "view cart" bar on phones. */
export function CartBar() {
  const cart = useCart();
  const pathname = usePathname();
  const t = useTranslations("cart");
  const count = cartCount(cart);
  if (count === 0 || pathname.startsWith("/cart") || pathname.startsWith("/checkout")) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
      <Link
        href="/cart"
        className="flex h-14 items-center justify-between rounded-full bg-primary px-5 text-primary-foreground shadow-lg"
      >
        <span className="flex items-center gap-2 font-semibold">
          <ShoppingBag className="size-5" aria-hidden />
          {t("viewCart")} · {t("items", { count })}
        </span>
        <span className="font-heading font-extrabold">{formatCHF(cartSubtotal(cart))}</span>
      </Link>
    </div>
  );
}
