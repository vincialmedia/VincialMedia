import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatDayShort, formatSlot, formatSlotInstants, formatTime, formatVatRate } from "./format";

describe("format", () => {
  it("formats Swiss dates and times", () => {
    expect(formatDate("2026-09-25")).toBe("25.09.2026");
    expect(formatSlot("11:45:00", "12:15:00")).toBe("11:45–12:15");
    expect(formatTime("2026-09-28T09:45:00Z")).toBe("11:45");
    expect(formatDateTime("2026-09-25T22:30:00Z")).toBe("26.09.2026, 00:30");
    expect(formatSlotInstants("2026-12-01T10:45:00Z", "2026-12-01T11:15:00Z")).toBe("11:45–12:15");
  });
  it("formats weekdays per locale", () => {
    expect(formatDayShort("2026-09-28", "de")).toBe("Mo, 28.09.");
    expect(formatDayShort("2026-09-28", "en")).toBe("Mon, 28.09.");
  });
  it("formats VAT rates", () => {
    expect(formatVatRate(810)).toBe("8.1");
    expect(formatVatRate(260)).toBe("2.6");
    expect(formatVatRate(700)).toBe("7");
  });
});
