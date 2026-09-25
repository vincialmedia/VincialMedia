import { describe, expect, it } from "vitest";
import { formatCHF, parseCHF, rappenToInput, roundTo5 } from "./money";

describe("roundTo5", () => {
  it("rounds to the nearest 5 Rappen, half up", () => {
    expect(roundTo5(0)).toBe(0);
    expect(roundTo5(122)).toBe(120);
    expect(roundTo5(122.5)).toBe(125);
    expect(roundTo5(123)).toBe(125);
    expect(roundTo5(127.4)).toBe(125);
    expect(roundTo5(127.5)).toBe(130);
  });
});

describe("formatCHF", () => {
  it("formats Rappen as CHF", () => {
    expect(formatCHF(1450)).toBe("CHF 14.50");
    expect(formatCHF(5)).toBe("CHF 0.05");
    expect(formatCHF(0)).toBe("CHF 0.00");
    expect(formatCHF(125000)).toBe("CHF 1'250.00");
    expect(formatCHF(-500)).toBe("-CHF 5.00");
  });
});

describe("parseCHF", () => {
  it("parses common Swiss notations", () => {
    expect(parseCHF("14.50")).toBe(1450);
    expect(parseCHF("14,5")).toBe(1450);
    expect(parseCHF("CHF 14")).toBe(1400);
    expect(parseCHF("14.-")).toBe(1400);
    expect(parseCHF("1'250.00")).toBe(125000);
    expect(parseCHF("0.05")).toBe(5);
  });
  it("rejects garbage and negatives", () => {
    expect(parseCHF("")).toBeNull();
    expect(parseCHF("-5")).toBeNull();
    expect(parseCHF("abc")).toBeNull();
    expect(parseCHF("1.234")).toBeNull();
  });
  it("round-trips with rappenToInput", () => {
    expect(rappenToInput(1450)).toBe("14.50");
    expect(parseCHF(rappenToInput(1995))).toBe(1995);
    expect(rappenToInput(null)).toBe("");
  });
});
