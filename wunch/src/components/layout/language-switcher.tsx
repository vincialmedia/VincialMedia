"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations("common");
  const query = Object.fromEntries(searchParams.entries());

  return (
    <nav aria-label={t("language")} className={cn("flex items-center rounded-full bg-secondary p-0.5 text-xs font-semibold", className)}>
      {(["de", "en"] as const).map((l) => (
        <Link
          key={l}
          href={{ pathname, query }}
          locale={l}
          aria-current={l === locale ? "true" : undefined}
          className={cn(
            "inline-flex min-h-9 min-w-9 items-center justify-center rounded-full px-2.5 uppercase",
            l === locale ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {l}
        </Link>
      ))}
    </nav>
  );
}
