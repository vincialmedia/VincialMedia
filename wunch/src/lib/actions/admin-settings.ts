"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ForbiddenError, assertAdmin } from "../auth";
import { parseCHF } from "../money";
import { isValidDateString } from "../schedule";
import { createClient } from "../supabase/server";
import { UUID_RE } from "../validation";

export type SettingsResult = { ok: true } | { ok: false; error: string; fields?: string[] };

const TIP_ALLOWED = new Set([...Array.from({ length: 20 }, (_, i) => i + 1), 25, 30]);

async function guard(fn: () => Promise<SettingsResult>): Promise<SettingsResult> {
  try {
    await assertAdmin();
    const r = await fn();
    revalidatePath("/[locale]", "layout");
    return r;
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: "forbidden" };
    console.error("settings action failed", e);
    return { ok: false, error: e instanceof Error ? e.message : "generic" };
  }
}

const money5 = z.string().transform((v, ctx) => {
  const r = v.trim() === "" ? 0 : parseCHF(v);
  if (r === null || r % 5 !== 0) {
    ctx.addIssue({ code: "custom", message: "money" });
    return z.NEVER;
  }
  return r;
});

const settingsSchema = z.object({
  sameDayCutoff: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  maxDaysAhead: z.coerce.number().int().min(0).max(6),
  deliveryWeekdays: z.array(z.coerce.number().int().min(1).max(7)).min(1),
  deliveryPostcodes: z.string().transform((v, ctx) => {
    const list = [...new Set(v.split(/[,\s]+/).map((p) => p.trim()).filter(Boolean))];
    if (!list.length || list.some((p) => !/^\d{4}$/.test(p))) {
      ctx.addIssue({ code: "custom", message: "postcodes" });
      return z.NEVER;
    }
    return list;
  }),
  minOrder: money5,
  deliveryFee: money5,
  tipPercentages: z.string().transform((v, ctx) => {
    const list = [...new Set(v.split(/[,\s%]+/).filter(Boolean).map(Number))].sort((a, b) => a - b);
    if (list.some((n) => !TIP_ALLOWED.has(n)) || list.length > 5) {
      ctx.addIssue({ code: "custom", message: "tips" });
      return z.NEVER;
    }
    return list;
  }),
  vatRate: z.string().transform((v, ctx) => {
    const n = Number((v.trim() || "0").replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      ctx.addIssue({ code: "custom", message: "vat" });
      return z.NEVER;
    }
    return Math.round(n * 100);
  }),
  vatNumber: z.string().trim().max(40),
  businessName: z.string().trim().min(1).max(120),
  businessAddress: z.string().trim().min(1).max(300),
  businessEmail: z.union([z.literal(""), z.email()]),
  notifyEmail: z.union([z.literal(""), z.email()]),
  reminderMinutes: z.coerce.number().int().min(1).max(240),
});

export async function saveSettings(formData: FormData): Promise<SettingsResult> {
  return guard(async () => {
    const parsed = settingsSchema.safeParse({
      sameDayCutoff: formData.get("sameDayCutoff"),
      maxDaysAhead: formData.get("maxDaysAhead"),
      deliveryWeekdays: formData.getAll("deliveryWeekdays"),
      deliveryPostcodes: formData.get("deliveryPostcodes") ?? "",
      minOrder: formData.get("minOrder") ?? "",
      deliveryFee: formData.get("deliveryFee") ?? "",
      tipPercentages: formData.get("tipPercentages") ?? "",
      vatRate: formData.get("vatRate") ?? "",
      vatNumber: formData.get("vatNumber") ?? "",
      businessName: formData.get("businessName") ?? "",
      businessAddress: formData.get("businessAddress") ?? "",
      businessEmail: String(formData.get("businessEmail") ?? "").trim(),
      notifyEmail: String(formData.get("notifyEmail") ?? "").trim(),
      reminderMinutes: formData.get("reminderMinutes"),
    });
    if (!parsed.success) return { ok: false, error: "invalid", fields: parsed.error.issues.map((i) => String(i.path[0])) };
    const d = parsed.data;
    const supabase = await createClient();
    const { error } = await supabase
      .from("settings")
      .update({
        same_day_cutoff: d.sameDayCutoff,
        max_days_ahead: d.maxDaysAhead,
        delivery_weekdays: [...new Set(d.deliveryWeekdays)].sort(),
        delivery_postcodes: d.deliveryPostcodes,
        min_order_rappen: d.minOrder,
        delivery_fee_rappen: d.deliveryFee,
        tip_percentages: d.tipPercentages,
        vat_rate_bp: d.vatRate,
        vat_number: d.vatNumber || null,
        business_name: d.businessName,
        business_address: d.businessAddress,
        business_email: d.businessEmail || null,
        notify_email: d.notifyEmail || null,
        undecided_reminder_minutes: d.reminderMinutes,
      })
      .eq("id", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
}

const slotSchema = z
  .object({
    id: z.string().regex(UUID_RE).optional(),
    startsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    endsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    maxOrders: z.union([z.literal(""), z.coerce.number().int().min(1).max(1000)]),
    isActive: z.boolean(),
  })
  .refine((s) => s.endsAt > s.startsAt, { path: ["endsAt"] });

export async function saveSlot(input: { id?: string; startsAt: string; endsAt: string; maxOrders: string; isActive: boolean }): Promise<SettingsResult> {
  return guard(async () => {
    const parsed = slotSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid", fields: parsed.error.issues.map((i) => String(i.path[0])) };
    const d = parsed.data;
    const row = { starts_at: d.startsAt, ends_at: d.endsAt, max_orders: d.maxOrders === "" ? null : d.maxOrders, is_active: d.isActive };
    const supabase = await createClient();
    const { error } = d.id ? await supabase.from("delivery_slots").update(row).eq("id", d.id) : await supabase.from("delivery_slots").insert(row);
    if (error) throw new Error(error.code === "23505" ? "slot_exists" : error.message);
    return { ok: true };
  });
}

export async function deleteSlot(id: string): Promise<SettingsResult> {
  return guard(async () => {
    if (!UUID_RE.test(id)) return { ok: false, error: "invalid" };
    const supabase = await createClient();
    const { count } = await supabase.from("orders").select("id", { count: "exact", head: true }).eq("slot_id", id);
    if ((count ?? 0) > 0) return { ok: false, error: "slot_in_use" };
    const { error } = await supabase.from("delivery_slots").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
}

export async function addClosedDate(date: string, reason: string): Promise<SettingsResult> {
  return guard(async () => {
    if (!isValidDateString(date)) return { ok: false, error: "invalid", fields: ["date"] };
    const supabase = await createClient();
    const { error } = await supabase.from("closed_dates").upsert({ closed_on: date, reason: reason.trim().slice(0, 200) || null });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
}

export async function removeClosedDate(date: string): Promise<SettingsResult> {
  return guard(async () => {
    if (!isValidDateString(date)) return { ok: false, error: "invalid" };
    const supabase = await createClient();
    const { error } = await supabase.from("closed_dates").delete().eq("closed_on", date);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
}
