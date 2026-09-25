// Display formatting. Dates like 25.09.2026, times like 12:15, always Europe/Zurich.
import { TIME_ZONE, shortTime } from "./schedule";

type Loc = "de" | "en" | string;

const intlLocale = (locale: Loc) => (locale === "en" ? "en-GB" : "de-CH");

/** "2026-09-25" -> "25.09.2026" */
export function formatDate(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}.${m}.${y}`;
}

/** "2026-09-28" -> "Mo, 28.09." / "Mon, 28.09." */
export function formatDayShort(date: string, locale: Loc): string {
  const [, m, d] = date.split("-");
  return `${formatWeekday(date, locale, "short")}, ${d}.${m}.`;
}

/** "2026-09-28" -> "Montag, 28.09.2026" */
export function formatDayLong(date: string, locale: Loc): string {
  return `${formatWeekday(date, locale, "long")}, ${formatDate(date)}`;
}

export function formatWeekday(date: string, locale: Loc, style: "short" | "long"): string {
  const w = new Intl.DateTimeFormat(intlLocale(locale), { weekday: style, timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
  return w.replace(/\.$/, "");
}

/** "11:45:00", "12:15:00" -> "11:45–12:15" */
export function formatSlot(startsAt: string, endsAt: string): string {
  return `${shortTime(startsAt)}–${shortTime(endsAt)}`;
}

/** Instant -> "12:15" in Zurich */
export function formatTime(instant: string | Date): string {
  return new Intl.DateTimeFormat("de-CH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TIME_ZONE,
  }).format(new Date(instant));
}

/** Instant -> "25.09.2026" in Zurich */
export function formatInstantDate(instant: string | Date): string {
  const parts = new Intl.DateTimeFormat("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: TIME_ZONE,
  }).formatToParts(new Date(instant));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}.${get("month")}.${get("year")}`;
}

/** Instant -> "25.09.2026, 12:15" */
export function formatDateTime(instant: string | Date): string {
  return `${formatInstantDate(instant)}, ${formatTime(instant)}`;
}

/** Slot label from absolute instants stored on an order */
export function formatSlotInstants(startsAt: string, endsAt: string): string {
  return `${formatTime(startsAt)}–${formatTime(endsAt)}`;
}

/** 810 -> "8.1" */
export function formatVatRate(bp: number): string {
  return (bp / 100).toFixed(2).replace(/\.?0+$/, "");
}

export function orderNumber(n: number | string): string {
  return `#${n}`;
}
