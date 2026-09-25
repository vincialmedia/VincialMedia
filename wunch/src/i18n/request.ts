import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import * as rootParams from "next/root-params";
import { routing } from "./routing";

export default getRequestConfig(async ({ locale }) => {
  if (!locale) {
    let param: string | undefined;
    try {
      param = await rootParams.locale();
    } catch {
      // Server Actions and Route Handlers have no root params; they pass the locale explicitly.
      param = undefined;
    }
    locale = hasLocale(routing.locales, param) ? param : routing.defaultLocale;
  }
  return {
    locale,
    timeZone: "Europe/Zurich",
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
