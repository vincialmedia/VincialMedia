"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ForbiddenError, assertAdmin } from "../auth";
import { isValidCouponCodeFormat, normalizeCouponCode } from "../coupons";
import { parseCHF } from "../money";
import { createClient } from "../supabase/server";
import { UUID_RE } from "../validation";

export type CouponResult = { ok: true; archived?: boolean } | { ok: false; error: string; fields?: string[] };

const optionalInt = z.union([z.literal(""), z.coerce.number().int().min(1).max(100_000)]);
const optionalDate = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);

const couponSchema = z
  .object({
    code: z.string().transform(normalizeCouponCode).refine(isValidCouponCodeFormat, "code"),
    kind: z.enum(["percent", "fixed"]),
    percentOff: z.string(),
    amountOff: z.string(),
    isActive: z.boolean(),
    validFrom: optionalDate,
    validTo: optionalDate,
    maxTotal: optionalInt,
    maxPerCustomer: optionalInt,
    minOrder: z.string(),
    firstOrderOnly: z.boolean(),
  })
  .transform((d, ctx) => {
    const percent = d.kind === "percent" ? Number(d.percentOff) : null;
    const amount = d.kind === "fixed" ? parseCHF(d.amountOff) : null;
    const minOrder = d.minOrder.trim() === "" ? 0 : parseCHF(d.minOrder);
    if (d.kind === "percent" && (!Number.isInteger(percent) || percent! < 1 || percent! > 100)) ctx.addIssue({ code: "custom", path: ["percentOff"], message: "percent" });
    if (d.kind === "fixed" && (amount === null || amount <= 0 || amount % 5 !== 0)) ctx.addIssue({ code: "custom", path: ["amountOff"], message: "amount" });
    if (minOrder === null) ctx.addIssue({ code: "custom", path: ["minOrder"], message: "minOrder" });
    if (d.validFrom && d.validTo && d.validTo < d.validFrom) ctx.addIssue({ code: "custom", path: ["validTo"], message: "range" });
    return {
      code: d.code,
      kind: d.kind,
      percent_off: percent,
      amount_off_rappen: amount,
      is_active: d.isActive,
      valid_from: d.validFrom || null,
      valid_to: d.validTo || null,
      max_total_uses: d.maxTotal === "" ? null : d.maxTotal,
      max_uses_per_customer: d.maxPerCustomer === "" ? null : d.maxPerCustomer,
      min_order_rappen: minOrder ?? 0,
      first_order_only: d.firstOrderOnly,
    };
  });

async function guard(fn: () => Promise<CouponResult>): Promise<CouponResult> {
  try {
    await assertAdmin();
    const r = await fn();
    revalidatePath("/[locale]/admin/coupons", "layout");
    return r;
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: "forbidden" };
    console.error("coupon action failed", e);
    return { ok: false, error: e instanceof Error ? e.message : "generic" };
  }
}

export async function saveCoupon(formData: FormData): Promise<CouponResult> {
  return guard(async () => {
    const id = String(formData.get("id") ?? "");
    const parsed = couponSchema.safeParse({
      code: formData.get("code") ?? "",
      kind: formData.get("kind"),
      percentOff: formData.get("percentOff") ?? "",
      amountOff: formData.get("amountOff") ?? "",
      isActive: formData.get("isActive") === "on",
      validFrom: formData.get("validFrom") ?? "",
      validTo: formData.get("validTo") ?? "",
      maxTotal: formData.get("maxTotal") ?? "",
      maxPerCustomer: formData.get("maxPerCustomer") ?? "",
      minOrder: formData.get("minOrder") ?? "",
      firstOrderOnly: formData.get("firstOrderOnly") === "on",
    });
    if (!parsed.success) return { ok: false, error: "invalid", fields: parsed.error.issues.map((i) => String(i.path[0])) };
    const supabase = await createClient();
    const { error } = id
      ? UUID_RE.test(id)
        ? await supabase.from("coupons").update(parsed.data).eq("id", id)
        : { error: { code: "invalid", message: "not_found" } }
      : await supabase.from("coupons").insert(parsed.data);
    if (error?.code === "23505") return { ok: false, error: "code_taken", fields: ["code"] };
    if (error) throw new Error(error.message);
    return { ok: true };
  });
}

/** Delete, or archive when the coupon was used (payment history stays intact). */
export async function deleteCoupon(id: string): Promise<CouponResult> {
  return guard(async () => {
    if (!UUID_RE.test(id)) return { ok: false, error: "not_found" };
    const supabase = await createClient();
    const { count } = await supabase.from("coupon_redemptions").select("id", { count: "exact", head: true }).eq("coupon_id", id);
    const { count: orders } = await supabase.from("orders").select("id", { count: "exact", head: true }).eq("coupon_id", id);
    if ((count ?? 0) + (orders ?? 0) > 0) {
      const { error } = await supabase.from("coupons").update({ archived_at: new Date().toISOString(), is_active: false }).eq("id", id);
      if (error) throw new Error(error.message);
      return { ok: true, archived: true };
    }
    const { error } = await supabase.from("coupons").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true, archived: false };
  });
}
