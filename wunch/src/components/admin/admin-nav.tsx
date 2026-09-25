"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  ["/admin", "today"],
  ["/admin/orders", "orders"],
  ["/admin/payments", "payments"],
  ["/admin/meals", "meals"],
  ["/admin/menu", "menu"],
  ["/admin/coupons", "coupons"],
  ["/admin/customers", "customers"],
  ["/admin/settings", "settings"],
] as const;

export function AdminNav() {
  const t = useTranslations("admin.nav");
  const pathname = usePathname();
  return (
    <nav aria-label={t("label")} className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-1">
        {ITEMS.map(([href, key]) => {
          const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block rounded-full px-3.5 py-2 text-sm font-semibold whitespace-nowrap",
                  active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
