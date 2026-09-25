import "server-only";
import { createAdminClient } from "../supabase/admin";
import type { Tables } from "../supabase/database.types";

export type AdminOrder = Tables<"orders"> & { order_items: Tables<"order_items">[] };

/** Statuses that belong on a delivery list. */
export const DELIVERY_STATUSES = ["new", "accepted", "delivered", "partially_refunded"] as const;

export async function getDeliveryList(date: string): Promise<AdminOrder[]> {
  const { data } = await createAdminClient()
    .from("orders")
    .select("*, order_items(*)")
    .eq("delivery_date", date)
    .in("status", [...DELIVERY_STATUSES])
    .order("slot_starts_at")
    .order("created_at");
  return (data ?? []) as AdminOrder[];
}

export async function getUndecidedOrders(exceptDate: string): Promise<AdminOrder[]> {
  const { data } = await createAdminClient()
    .from("orders")
    .select("*, order_items(*)")
    .eq("status", "new")
    .neq("delivery_date", exceptDate)
    .order("slot_starts_at");
  return (data ?? []) as AdminOrder[];
}

export type CookingLine = {
  mealId: string;
  nameDe: string;
  nameEn: string;
  confirmed: number; // accepted or delivered
  pending: number; // waiting for a decision
  portionLimit: number | null;
  portionsLeft: number | null;
};

/** How many of each meal to cook on a date, plus portions still available. */
export async function getCookingSummary(date: string, orders: AdminOrder[]): Promise<CookingLine[]> {
  const { data: days } = await createAdminClient()
    .from("menu_days")
    .select("meal_id, portion_limit, portions_reserved, meal:meals(name_de, name_en, sort_order)")
    .eq("menu_date", date);

  const lines = new Map<string, CookingLine & { sort: number }>();
  for (const d of days ?? []) {
    const meal = d.meal as { name_de: string; name_en: string; sort_order: number } | null;
    lines.set(d.meal_id, {
      mealId: d.meal_id,
      nameDe: meal?.name_de ?? "?",
      nameEn: meal?.name_en ?? "?",
      confirmed: 0,
      pending: 0,
      portionLimit: d.portion_limit,
      portionsLeft: d.portion_limit === null ? null : Math.max(0, d.portion_limit - d.portions_reserved),
      sort: meal?.sort_order ?? 0,
    });
  }
  for (const o of orders) {
    for (const i of o.order_items) {
      const line =
        lines.get(i.meal_id) ??
        ({ mealId: i.meal_id, nameDe: i.name_de, nameEn: i.name_en, confirmed: 0, pending: 0, portionLimit: null, portionsLeft: null, sort: 999 } as CookingLine & { sort: number });
      if (o.status === "new") line.pending += i.quantity;
      else line.confirmed += i.quantity;
      lines.set(i.meal_id, line);
    }
  }
  return [...lines.values()]
    .sort((a, b) => a.sort - b.sort)
    .map((l) => ({ mealId: l.mealId, nameDe: l.nameDe, nameEn: l.nameEn, confirmed: l.confirmed, pending: l.pending, portionLimit: l.portionLimit, portionsLeft: l.portionsLeft }));
}
