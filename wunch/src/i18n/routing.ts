import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["de", "en"],
  defaultLocale: "de",
  // German lives at "/", English at "/en"
  localePrefix: "as-needed",
  // Always start in German; the language switch remembers the choice
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];
