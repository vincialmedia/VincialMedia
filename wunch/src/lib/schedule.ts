// Delivery calendar rules: cutoff, days ahead, weekdays, closed dates, slots.
// All business dates are Europe/Zurich calendar dates as "YYYY-MM-DD" strings.
import { TZDate, tz } from "@date-fns/tz";
import { format } from "date-fns";

export const TIME_ZONE = "Europe/Zurich";
/** The hold on the card must outlive the auto-cancel by this much. */
export const CAPTURE_SAFETY_HOURS = 12;
/** Checkouts that never got authorised are released after this long. */
export const PENDING_PAYMENT_TIMEOUT_MINUTES = 30;

export type CalendarSettings = {
  sameDayCutoff: string; // "HH:mm" or "HH:mm:ss"
  maxDaysAhead: number;
  deliveryWeekdays: number[]; // ISO: 1 = Monday ... 7 = Sunday
};

export type Slot = {
  id: string;
  startsAt: string; // "HH:mm" or "HH:mm:ss"
  endsAt: string;
  maxOrders: number | null;
  isActive: boolean;
};

export type SlotAvailability = "available" | "full" | "started";

/** Current date and time in Zurich. */
export function zurichNow(now: Date = new Date()): { date: string; time: string; minutes: number } {
  const date = format(now, "yyyy-MM-dd", { in: tz(TIME_ZONE) });
  const time = format(now, "HH:mm", { in: tz(TIME_ZONE) });
  return { date, time, minutes: timeToMinutes(time) };
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** "11:45:00" -> "11:45" */
export function shortTime(time: string): string {
  return time.slice(0, 5);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** ISO weekday of a calendar date: 1 = Monday ... 7 = Sunday */
export function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export function isValidDateString(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

/** Wall-clock time in Zurich on a given date, as an absolute instant. */
export function zurichDateTime(date: string, time: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return new Date(new TZDate(y, mo - 1, d, h, mi, 0, TIME_ZONE).getTime());
}

/** Monday of the week containing `date`. */
export function startOfIsoWeek(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

/** Is same-day ordering still open at `now`? */
export function isBeforeCutoff(now: Date, settings: Pick<CalendarSettings, "sameDayCutoff">): boolean {
  return zurichNow(now).minutes < timeToMinutes(settings.sameDayCutoff);
}

/**
 * Dates a customer can order for right now: today (only before the cutoff)
 * up to `maxDaysAhead` calendar days ahead, on delivery weekdays, not closed.
 */
export function getOrderableDates(
  now: Date,
  settings: CalendarSettings,
  closedDates: Iterable<string>,
): string[] {
  const closed = new Set(closedDates);
  const today = zurichNow(now).date;
  const beforeCutoff = isBeforeCutoff(now, settings);
  const dates: string[] = [];
  for (let i = 0; i <= settings.maxDaysAhead; i++) {
    const date = addDays(today, i);
    if (i === 0 && !beforeCutoff) continue;
    if (!settings.deliveryWeekdays.includes(isoWeekday(date))) continue;
    if (closed.has(date)) continue;
    dates.push(date);
  }
  return dates;
}

export function isDateOrderable(
  date: string,
  now: Date,
  settings: CalendarSettings,
  closedDates: Iterable<string>,
): boolean {
  return getOrderableDates(now, settings, closedDates).includes(date);
}

/** Whether a slot can still take an order on `date`. */
export function getSlotAvailability(
  slot: Slot,
  date: string,
  now: Date,
  orderCount: number,
): SlotAvailability {
  if (!slot.isActive || zurichDateTime(date, slot.startsAt).getTime() <= now.getTime()) return "started";
  if (slot.maxOrders !== null && orderCount >= slot.maxOrders) return "full";
  return "available";
}

/**
 * When an undecided order must be cancelled: at slot start, or 12 hours
 * before Stripe's capture deadline, whichever comes first.
 */
export function autoCancelAt(slotStartsAt: Date, captureBefore: Date | null): Date {
  if (!captureBefore) return slotStartsAt;
  const safe = new Date(captureBefore.getTime() - CAPTURE_SAFETY_HOURS * 3_600_000);
  return safe < slotStartsAt ? safe : slotStartsAt;
}
