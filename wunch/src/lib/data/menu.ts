import "server-only";
import { createAdminClient } from "../supabase/admin";
import type { Tables } from "../supabase/database.types";

export type Meal = Tables<"meals">;

export type MenuItem = {
  meal: Meal;
  portionLimit: number | null; // null = unlimited
  portionsLeft: number | null; // null = unlimited
  soldOut: boolean;
};

/**
 * What's on the menu for a date: planned meals plus always-available ones,
 * with portions left. Uses the service role but only returns public data.
 */
export async function getMenuForDate(date: string): Promise<MenuItem[]> {
  const db = createAdminClient();
  const [{ data: days }, { data: always }] = await Promise.all([
    db.from("menu_days").select("*, meal:meals(*)").eq("menu_date", date),
    db.from("meals").select("*").eq("always_available", true).eq("is_active", true).is("archived_at", null),
  ]);

  const items: MenuItem[] = [];
  const seen = new Set<string>();

  for (const day of days ?? []) {
    const meal = day.meal as Meal | null;
    if (!meal || !meal.is_active || meal.archived_at) continue;
    if (day.source === "always" && !meal.always_available) continue;
    seen.add(meal.id);
    const left = day.portion_limit === null ? null : Math.max(0, day.portion_limit - day.portions_reserved);
    items.push({ meal, portionLimit: day.portion_limit, portionsLeft: left, soldOut: left === 0 });
  }

  for (const meal of always ?? []) {
    if (seen.has(meal.id)) continue;
    const left = meal.daily_portion_limit;
    items.push({ meal, portionLimit: left, portionsLeft: left, soldOut: left === 0 });
  }

  const categoryOrder = ["main", "soup", "salad", "side", "dessert", "drink"];
  return items.sort(
    (a, b) =>
      categoryOrder.indexOf(a.meal.category) - categoryOrder.indexOf(b.meal.category) ||
      a.meal.sort_order - b.meal.sort_order ||
      a.meal.name_de.localeCompare(b.meal.name_de),
  );
}

export async function getMeal(id: string): Promise<Meal | null> {
  const { data } = await createAdminClient()
    .from("meals")
    .select("*")
    .eq("id", id)
    .eq("is_active", true)
    .is("archived_at", null)
    .maybeSingle();
  return data;
}

/** Which dates each meal is on, within a date range (for "also on ..." hints and the cart). */
export async function getMenuDates(from: string, to: string): Promise<Map<string, string[]>> {
  const { data } = await createAdminClient()
    .from("menu_days")
    .select("menu_date, meal_id")
    .gte("menu_date", from)
    .lte("menu_date", to)
    .eq("source", "planned");
  const map = new Map<string, string[]>();
  for (const row of data ?? []) {
    map.set(row.meal_id, [...(map.get(row.meal_id) ?? []), row.menu_date]);
  }
  return map;
}
