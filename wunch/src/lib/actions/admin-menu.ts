"use server";

import { revalidatePath } from "next/cache";
import { ForbiddenError, assertAdmin } from "../auth";
import { addDays, isValidDateString } from "../schedule";
import { createClient } from "../supabase/server";
import { UUID_RE } from "../validation";

export type MenuResult = { ok: true; count?: number } | { ok: false; error: "forbidden" | "invalid" | "has_orders" | "below_reserved" | "generic" };

async function guard(fn: () => Promise<MenuResult>): Promise<MenuResult> {
  try {
    await assertAdmin();
    const result = await fn();
    revalidatePath("/[locale]/admin/menu", "page");
    revalidatePath("/[locale]", "layout");
    return result;
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: "forbidden" };
    console.error("menu action failed", e);
    return { ok: false, error: "generic" };
  }
}

function parseLimit(limit: string | number | null): number | null | undefined {
  if (limit === null || limit === "") return null;
  const n = Number(limit);
  return Number.isInteger(n) && n >= 0 && n <= 10_000 ? n : undefined;
}

export async function setMenuItem(date: string, mealId: string, limit: string | number | null): Promise<MenuResult> {
  return guard(async () => {
    const portionLimit = parseLimit(limit);
    if (!isValidDateString(date) || !UUID_RE.test(mealId) || portionLimit === undefined) return { ok: false, error: "invalid" };
    const supabase = await createClient();
    const { data: existing } = await supabase.from("menu_days").select("source").eq("menu_date", date).eq("meal_id", mealId).maybeSingle();
    const { error } = existing
      ? await supabase.from("menu_days").update({ portion_limit: portionLimit }).eq("menu_date", date).eq("meal_id", mealId)
      : await supabase.from("menu_days").insert({ menu_date: date, meal_id: mealId, portion_limit: portionLimit, source: "planned" });
    if (error?.code === "23514") return { ok: false, error: "below_reserved" };
    if (error) throw new Error(error.message);
    return { ok: true };
  });
}

export async function removeMenuItem(date: string, mealId: string): Promise<MenuResult> {
  return guard(async () => {
    if (!isValidDateString(date) || !UUID_RE.test(mealId)) return { ok: false, error: "invalid" };
    const supabase = await createClient();
    const { error } = await supabase.from("menu_days").delete().eq("menu_date", date).eq("meal_id", mealId);
    if (error?.message.includes("menu_day_has_orders")) return { ok: false, error: "has_orders" };
    if (error) throw new Error(error.message);
    return { ok: true };
  });
}

/** Copy last week's planned meals into the week starting at `monday`. Existing entries stay. */
export async function copyLastWeek(monday: string): Promise<MenuResult> {
  return guard(async () => {
    if (!isValidDateString(monday)) return { ok: false, error: "invalid" };
    const supabase = await createClient();
    const { data: previous } = await supabase
      .from("menu_days")
      .select("menu_date, meal_id, portion_limit, meal:meals(is_active, archived_at)")
      .eq("source", "planned")
      .gte("menu_date", addDays(monday, -7))
      .lte("menu_date", addDays(monday, -1));
    const { data: current } = await supabase.from("menu_days").select("menu_date, meal_id").gte("menu_date", monday).lte("menu_date", addDays(monday, 6));
    const taken = new Set((current ?? []).map((r) => `${r.menu_date}|${r.meal_id}`));
    const rows = (previous ?? [])
      .filter((r) => {
        const meal = r.meal as { is_active: boolean; archived_at: string | null } | null;
        return meal?.is_active && !meal.archived_at && !taken.has(`${addDays(r.menu_date, 7)}|${r.meal_id}`);
      })
      .map((r) => ({ menu_date: addDays(r.menu_date, 7), meal_id: r.meal_id, portion_limit: r.portion_limit, source: "planned" as const }));
    if (rows.length) {
      const { error } = await supabase.from("menu_days").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { ok: true, count: rows.length };
  });
}
