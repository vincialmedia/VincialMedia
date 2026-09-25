"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "../auth";
import { createClient } from "../supabase/server";
import { profileSchema } from "../validation";

export type ActionResult = { ok: true } | { ok: false; error: string; fields?: string[] };

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "not_signed_in" };
  const blankToUndefined = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" && v.trim() !== "" ? v : undefined;
  };
  const parsed = profileSchema.safeParse({
    fullName: blankToUndefined("fullName"),
    company: formData.get("company") ?? "",
    street: blankToUndefined("street"),
    postcode: blankToUndefined("postcode"),
    city: blankToUndefined("city"),
    floorRoom: formData.get("floorRoom") ?? "",
    phone: blankToUndefined("phone"),
    deliveryNote: formData.get("deliveryNote") ?? "",
    locale: formData.get("locale") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: "invalid_input", fields: parsed.error.issues.map((i) => String(i.path[0])) };
  }
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: d.fullName ?? null,
      company: d.company || null,
      street: d.street ?? null,
      postcode: d.postcode ?? null,
      city: d.city ?? null,
      floor_room: d.floorRoom || null,
      phone: d.phone ?? null,
      delivery_note: d.deliveryNote || null,
      ...(d.locale ? { locale: d.locale } : {}),
    })
    .eq("id", user.id);
  if (error) return { ok: false, error: "generic" };
  revalidatePath("/[locale]/account", "page");
  return { ok: true };
}
