"use server";

import { getSessionUser } from "../auth";
import { getMenuForDate } from "../data/menu";
import { getClosedDates, getSettings, toCalendarSettings } from "../data/settings";
import { getOrderableDates, zurichNow } from "../schedule";
import { createClient } from "../supabase/server";
import { UUID_RE } from "../validation";

export type ReorderResult =
  | { ok: true; date: string; lines: { mealId: string; quantity: number; nameDe: string; nameEn: string; priceRappen: number; imagePath: string | null }[]; skipped: number }
  | { ok: false; error: "not_found" | "nothing_available" | "not_signed_in" };

/** Put a past order's dishes into a cart for the first day they're available. */
export async function reorder(orderId: string): Promise<ReorderResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "not_signed_in" };
  if (!UUID_RE.test(orderId)) return { ok: false, error: "not_found" };
  const supabase = await createClient();
  const { data: items } = await supabase.from("order_items").select("meal_id, quantity").eq("order_id", orderId);
  if (!items?.length) return { ok: false, error: "not_found" };

  const now = new Date();
  const settings = await getSettings();
  const dates = getOrderableDates(now, toCalendarSettings(settings), await getClosedDates(zurichNow(now).date));

  let best: ReorderResult | null = null;
  for (const date of dates) {
    const menu = await getMenuForDate(date);
    const lines = items.flatMap((i) => {
      const m = menu.find((x) => x.meal.id === i.meal_id && !x.soldOut);
      if (!m) return [];
      const quantity = m.portionsLeft === null ? i.quantity : Math.min(i.quantity, m.portionsLeft);
      return [{ mealId: m.meal.id, quantity, nameDe: m.meal.name_de, nameEn: m.meal.name_en, priceRappen: m.meal.price_rappen, imagePath: m.meal.image_path }];
    });
    if (lines.length === items.length) return { ok: true, date, lines, skipped: 0 };
    if (lines.length && (!best || !best.ok || lines.length > best.lines.length)) {
      best = { ok: true, date, lines, skipped: items.length - lines.length };
    }
  }
  return best ?? { ok: false, error: "nothing_available" };
}
