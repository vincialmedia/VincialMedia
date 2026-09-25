import "server-only";
import { cache } from "react";
import type { CalendarSettings, Slot } from "../schedule";
import { createAdminClient } from "../supabase/admin";
import type { Tables } from "../supabase/database.types";

export type Settings = Tables<"settings">;

export const getSettings = cache(async (): Promise<Settings> => {
  const { data, error } = await createAdminClient().from("settings").select("*").single();
  if (error || !data) throw new Error(`settings missing: ${error?.message}`);
  return data;
});

export function toCalendarSettings(s: Settings): CalendarSettings {
  return {
    sameDayCutoff: s.same_day_cutoff,
    maxDaysAhead: s.max_days_ahead,
    deliveryWeekdays: s.delivery_weekdays,
  };
}

export const getSlots = cache(async (): Promise<Slot[]> => {
  const { data } = await createAdminClient().from("delivery_slots").select("*").order("starts_at");
  return (data ?? []).map((s) => ({
    id: s.id,
    startsAt: s.starts_at,
    endsAt: s.ends_at,
    maxOrders: s.max_orders,
    isActive: s.is_active,
  }));
});

export const getClosedDates = cache(async (fromDate: string): Promise<string[]> => {
  const { data } = await createAdminClient().from("closed_dates").select("closed_on").gte("closed_on", fromDate);
  return (data ?? []).map((d) => d.closed_on);
});
