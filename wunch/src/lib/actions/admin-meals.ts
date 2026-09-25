"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ForbiddenError, assertAdmin } from "../auth";
import { ALLERGENS, CATEGORIES, DIETARY_TAGS } from "../i18n-keys";
import { MAX_UPLOAD_BYTES, processMealImage } from "../image-processing";
import { MEAL_IMAGE_BUCKET, MEAL_IMAGE_SIZES } from "../images";
import { parseCHF } from "../money";
import { createClient } from "../supabase/server";
import { UUID_RE } from "../validation";

export type AdminResult = { ok: true; id?: string; archived?: boolean } | { ok: false; error: string; fields?: string[] };

const mealSchema = z.object({
  nameDe: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().min(1).max(120),
  descriptionDe: z.string().trim().max(2000),
  descriptionEn: z.string().trim().max(2000),
  price: z.string().transform((v, ctx) => {
    const r = parseCHF(v);
    if (r === null || r % 5 !== 0) {
      ctx.addIssue({ code: "custom", message: "price" });
      return z.NEVER;
    }
    return r;
  }),
  category: z.enum(CATEGORIES as [string, ...string[]]),
  dietary: z.array(z.enum(DIETARY_TAGS as [string, ...string[]])),
  allergens: z.array(z.enum(ALLERGENS as [string, ...string[]])),
  isActive: z.boolean(),
  alwaysAvailable: z.boolean(),
  dailyLimit: z.union([z.literal(""), z.coerce.number().int().min(0).max(1000)]),
  sortOrder: z.coerce.number().int().min(-1000).max(1000),
});

function refresh() {
  revalidatePath("/[locale]/admin", "layout");
  revalidatePath("/[locale]", "layout");
}

async function guard<T extends AdminResult>(fn: () => Promise<T>): Promise<T | AdminResult> {
  try {
    await assertAdmin();
    return await fn();
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: "forbidden" };
    console.error("admin meals action failed", e);
    return { ok: false, error: e instanceof Error ? e.message : "generic" };
  }
}

async function uploadPhoto(supabase: Awaited<ReturnType<typeof createClient>>, mealId: string, file: File): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("photo_too_big");
  const variants = await processMealImage(Buffer.from(await file.arrayBuffer())).catch(() => {
    throw new Error("photo_invalid");
  });
  const base = `meals/${mealId}/${Date.now()}`;
  for (const size of MEAL_IMAGE_SIZES) {
    const { error } = await supabase.storage
      .from(MEAL_IMAGE_BUCKET)
      .upload(`${base}-${size}.webp`, variants[size], { contentType: "image/webp", cacheControl: "31536000", upsert: false });
    if (error) throw new Error(`upload failed: ${error.message}`);
  }
  return base;
}

async function removePhoto(supabase: Awaited<ReturnType<typeof createClient>>, path: string | null) {
  if (!path || path.startsWith("seed/")) return;
  await supabase.storage.from(MEAL_IMAGE_BUCKET).remove(MEAL_IMAGE_SIZES.map((s) => `${path}-${s}.webp`));
}

export async function saveMeal(formData: FormData): Promise<AdminResult> {
  return guard(async () => {
    const id = String(formData.get("id") ?? "");
    const parsed = mealSchema.safeParse({
      nameDe: formData.get("nameDe"),
      nameEn: formData.get("nameEn"),
      descriptionDe: formData.get("descriptionDe") ?? "",
      descriptionEn: formData.get("descriptionEn") ?? "",
      price: formData.get("price"),
      category: formData.get("category"),
      dietary: formData.getAll("dietary"),
      allergens: formData.getAll("allergens"),
      isActive: formData.get("isActive") === "on",
      alwaysAvailable: formData.get("alwaysAvailable") === "on",
      dailyLimit: formData.get("dailyLimit") ?? "",
      sortOrder: formData.get("sortOrder") || 0,
    });
    if (!parsed.success) return { ok: false, error: "invalid", fields: parsed.error.issues.map((i) => String(i.path[0])) };
    const d = parsed.data;
    const supabase = await createClient();
    const row = {
      name_de: d.nameDe,
      name_en: d.nameEn,
      description_de: d.descriptionDe,
      description_en: d.descriptionEn,
      price_rappen: d.price,
      category: d.category,
      dietary_tags: d.dietary,
      allergens: d.allergens,
      is_active: d.isActive,
      always_available: d.alwaysAvailable,
      daily_portion_limit: d.alwaysAvailable && d.dailyLimit !== "" ? d.dailyLimit : null,
      sort_order: d.sortOrder,
    };

    let mealId = id;
    let oldPath: string | null = null;
    if (id) {
      if (!UUID_RE.test(id)) return { ok: false, error: "not_found" };
      const { data: existing } = await supabase.from("meals").select("image_path").eq("id", id).single();
      oldPath = existing?.image_path ?? null;
      const { error } = await supabase.from("meals").update(row).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { data, error } = await supabase.from("meals").insert(row).select("id").single();
      if (error || !data) throw new Error(error?.message ?? "insert failed");
      mealId = data.id;
    }

    const photo = formData.get("photo");
    if (photo instanceof File && photo.size > 0) {
      const path = await uploadPhoto(supabase, mealId, photo);
      await supabase.from("meals").update({ image_path: path }).eq("id", mealId);
      await removePhoto(supabase, oldPath);
    } else if (formData.get("removePhoto") === "on" && oldPath) {
      await supabase.from("meals").update({ image_path: null }).eq("id", mealId);
      await removePhoto(supabase, oldPath);
    }
    refresh();
    return { ok: true, id: mealId };
  });
}

/** Delete, or archive when the meal was ever ordered (old orders stay correct). */
export async function deleteMeal(id: string): Promise<AdminResult> {
  return guard(async () => {
    if (!UUID_RE.test(id)) return { ok: false, error: "not_found" };
    const supabase = await createClient();
    const { count } = await supabase.from("order_items").select("id", { count: "exact", head: true }).eq("meal_id", id);
    if ((count ?? 0) > 0) {
      const { error } = await supabase.from("meals").update({ archived_at: new Date().toISOString(), is_active: false }).eq("id", id);
      if (error) throw new Error(error.message);
      // take it off future menus that have no orders
      await supabase.from("menu_days").delete().eq("meal_id", id).eq("portions_reserved", 0);
      refresh();
      return { ok: true, archived: true };
    }
    const { data: meal } = await supabase.from("meals").select("image_path").eq("id", id).single();
    const { error } = await supabase.from("meals").delete().eq("id", id);
    if (error) throw new Error(error.message);
    await removePhoto(supabase, meal?.image_path ?? null);
    refresh();
    return { ok: true, archived: false };
  });
}

export async function restoreMeal(id: string): Promise<AdminResult> {
  return guard(async () => {
    if (!UUID_RE.test(id)) return { ok: false, error: "not_found" };
    const supabase = await createClient();
    const { error } = await supabase.from("meals").update({ archived_at: null }).eq("id", id);
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true };
  });
}
