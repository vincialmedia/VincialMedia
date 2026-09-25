// Money helpers. Every amount in wunch is an integer number of Rappen.

/** Round to the nearest 5 Rappen (Swiss cash rounding), half up. */
export function roundTo5(rappen: number): number {
  return Math.round(rappen / 5) * 5;
}

/** 1450 -> "CHF 14.50", 125000 -> "CHF 1'250.00" */
export function formatCHF(rappen: number): string {
  const sign = rappen < 0 ? "-" : "";
  const abs = Math.abs(Math.round(rappen));
  const francs = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  const cents = (abs % 100).toString().padStart(2, "0");
  return `${sign}CHF ${francs}.${cents}`;
}

/** 1450 -> "14.50" (for form inputs) */
export function rappenToInput(rappen: number | null | undefined): string {
  if (rappen === null || rappen === undefined) return "";
  return (rappen / 100).toFixed(2);
}

/**
 * Parse user input like "14.50", "14,5", "CHF 14", "14.-" into Rappen.
 * Returns null for anything that isn't a plain non-negative amount.
 */
export function parseCHF(input: string): number | null {
  const cleaned = input
    .trim()
    .replace(/^chf\s*/i, "")
    .replace(/\.-$/, "")
    .replace(/['’\s]/g, "")
    .replace(",", ".");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(cleaned)) return null;
  const [francs, cents = ""] = cleaned.split(".");
  return Number(francs) * 100 + Number(cents.padEnd(2, "0"));
}
