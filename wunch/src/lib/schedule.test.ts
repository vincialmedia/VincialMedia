import { describe, expect, it } from "vitest";
import {
  addDays,
  autoCancelAt,
  getOrderableDates,
  getSlotAvailability,
  isDateOrderable,
  isValidDateString,
  isoWeekday,
  startOfIsoWeek,
  zurichDateTime,
  zurichNow,
} from "./schedule";

const settings = { sameDayCutoff: "10:30:00", maxDaysAhead: 5, deliveryWeekdays: [1, 2, 3, 4, 5] };
// Friday 25.09.2026, times given in Zurich (CEST = UTC+2)
const fri0900 = new Date("2026-09-25T07:00:00Z");
const fri1029 = new Date("2026-09-25T08:29:00Z");
const fri1030 = new Date("2026-09-25T08:30:00Z");

describe("calendar helpers", () => {
  it("knows Zurich time, including DST", () => {
    expect(zurichNow(fri0900)).toEqual({ date: "2026-09-25", time: "09:00", minutes: 540 });
    // 23:30 UTC on 25.09 is already 26.09 in Zurich
    expect(zurichNow(new Date("2026-09-25T22:30:00Z")).date).toBe("2026-09-26");
    // winter time (CET = UTC+1)
    expect(zurichNow(new Date("2026-12-01T10:00:00Z")).time).toBe("11:00");
  });
  it("does date arithmetic on calendar dates", () => {
    expect(addDays("2026-09-25", 3)).toBe("2026-09-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(isoWeekday("2026-09-25")).toBe(5);
    expect(isoWeekday("2026-09-27")).toBe(7);
    expect(startOfIsoWeek("2026-09-27")).toBe("2026-09-21");
    expect(isValidDateString("2026-02-30")).toBe(false);
    expect(isValidDateString("2026-09-25")).toBe(true);
  });
  it("converts Zurich wall time to an instant", () => {
    expect(zurichDateTime("2026-09-28", "11:45").toISOString()).toBe("2026-09-28T09:45:00.000Z");
    expect(zurichDateTime("2026-12-01", "11:45:00").toISOString()).toBe("2026-12-01T10:45:00.000Z");
  });
});

describe("getOrderableDates", () => {
  it("includes today before the cutoff, then weekdays up to 5 calendar days ahead", () => {
    // Fri 25 (today), Sat/Sun skipped, Mon 28, Tue 29, Wed 30 (= +5)
    expect(getOrderableDates(fri0900, settings, [])).toEqual(["2026-09-25", "2026-09-28", "2026-09-29", "2026-09-30"]);
    expect(getOrderableDates(fri1029, settings, [])[0]).toBe("2026-09-25");
  });
  it("drops today at the cutoff", () => {
    expect(getOrderableDates(fri1030, settings, [])).toEqual(["2026-09-28", "2026-09-29", "2026-09-30"]);
  });
  it("skips closed dates", () => {
    expect(getOrderableDates(fri0900, settings, ["2026-09-28"])).toEqual(["2026-09-25", "2026-09-29", "2026-09-30"]);
  });
  it("respects the delivery weekdays and days-ahead settings", () => {
    expect(getOrderableDates(fri0900, { ...settings, deliveryWeekdays: [1, 3], maxDaysAhead: 6 }, [])).toEqual(["2026-09-28", "2026-09-30"]);
    expect(getOrderableDates(fri0900, { ...settings, maxDaysAhead: 0 }, [])).toEqual(["2026-09-25"]);
  });
  it("answers single-date questions", () => {
    expect(isDateOrderable("2026-09-26", fri0900, settings, [])).toBe(false); // Saturday
    expect(isDateOrderable("2026-10-01", fri0900, settings, [])).toBe(false); // +6 days
    expect(isDateOrderable("2026-09-29", fri0900, settings, [])).toBe(true);
  });
});

describe("getSlotAvailability", () => {
  const slot = { id: "s1", startsAt: "11:45:00", endsAt: "12:15:00", maxOrders: 2, isActive: true };
  it("is available with room left", () => {
    expect(getSlotAvailability(slot, "2026-09-25", fri0900, 1)).toBe("available");
  });
  it("is full at the maximum", () => {
    expect(getSlotAvailability(slot, "2026-09-25", fri0900, 2)).toBe("full");
    expect(getSlotAvailability({ ...slot, maxOrders: null }, "2026-09-25", fri0900, 99)).toBe("available");
  });
  it("is closed once the slot has started or is inactive", () => {
    expect(getSlotAvailability(slot, "2026-09-25", new Date("2026-09-25T09:45:00Z"), 0)).toBe("started");
    expect(getSlotAvailability({ ...slot, isActive: false }, "2026-09-28", fri0900, 0)).toBe("started");
  });
});

describe("autoCancelAt", () => {
  const slotStart = new Date("2026-09-30T09:45:00Z");
  it("uses slot start when the capture deadline is far away", () => {
    expect(autoCancelAt(slotStart, new Date("2026-10-02T07:00:00Z"))).toEqual(slotStart);
  });
  it("uses 12 hours before the capture deadline when that comes first", () => {
    expect(autoCancelAt(slotStart, new Date("2026-09-30T12:00:00Z"))).toEqual(new Date("2026-09-30T00:00:00Z"));
  });
  it("falls back to slot start without a capture deadline", () => {
    expect(autoCancelAt(slotStart, null)).toEqual(slotStart);
  });
});
