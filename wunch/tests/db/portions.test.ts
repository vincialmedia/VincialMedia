import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { amounts, createTestUser, db, details, futureDate } from "./helpers";

// These run against the local Supabase stack (npm run db:start).
let mealId: string;
let slotId: string;
let userA: string;
let userB: string;
const date = futureDate(21);
const PRICE = 1500;

async function order(userId: string, quantity: number, opts: { couponId?: string; price?: number; slot?: string } = {}) {
  return db.rpc("create_order", {
    p_user_id: userId,
    p_delivery_date: date,
    p_slot_id: opts.slot ?? slotId,
    p_items: [{ meal_id: mealId, quantity, unit_price_rappen: opts.price ?? PRICE }],
    p_details: details,
    p_amounts: amounts(PRICE * quantity),
    p_coupon_id: (opts.couponId ?? null) as string,
    p_locale: "de",
  });
}

async function reserved() {
  const { data } = await db.from("menu_days").select("portions_reserved").eq("menu_date", date).eq("meal_id", mealId).single();
  return data!.portions_reserved;
}

async function cancel(orderId: string, to: "rejected" | "expired" | "auto_cancelled" | "payment_failed", from: ("pending_payment" | "new")[] = ["pending_payment"]) {
  return db.rpc("transition_order", { p_order_id: orderId, p_from: from, p_to: to, p_actor_type: "system" });
}

beforeAll(async () => {
  const { data: meal, error } = await db
    .from("meals")
    .insert({ name_de: "DB-Test Gericht", name_en: "DB test meal", price_rappen: PRICE, category: "main", is_active: true })
    .select("id")
    .single();
  if (error) throw error;
  mealId = meal.id;
  const { data: slot } = await db.from("delivery_slots").insert({ starts_at: "11:00", ends_at: "11:30", max_orders: 2 }).select("id").single();
  slotId = slot!.id;
  userA = await createTestUser();
  userB = await createTestUser();
  createdUsers.push(userA, userB);
});

const createdSlots: string[] = [];
const createdUsers: string[] = [];

afterAll(async () => {
  // orders cascade to items, events and coupon redemptions
  await db.from("orders").delete().eq("delivery_date", date);
  await db.from("menu_days").update({ portions_reserved: 0 }).eq("meal_id", mealId);
  await db.from("menu_days").delete().eq("meal_id", mealId);
  await db.from("coupons").delete().eq("code", "DBTEST1");
  await db.from("delivery_slots").delete().in("id", [slotId, ...createdSlots]);
  await db.from("meals").delete().eq("id", mealId);
  for (const id of createdUsers) await db.auth.admin.deleteUser(id);
});

describe("portion reservation (Postgres)", () => {
  it("only one of two parallel checkouts gets the last portion", async () => {
    await db.from("menu_days").insert({ menu_date: date, meal_id: mealId, portion_limit: 1 });
    const [a, b] = await Promise.all([order(userA, 1), order(userB, 1)]);
    const results = [a, b].map((r) => (r.error ? r.error.message.split(":")[0] : "ok")).sort();
    expect(results).toEqual(["ok", "sold_out"]);
    expect(await reserved()).toBe(1);
  });

  it("releases portions when an order is cancelled, exactly once", async () => {
    const { data: orders } = await db.from("orders").select("id").eq("delivery_date", date).eq("status", "pending_payment");
    const id = orders![0].id;
    const first = await cancel(id, "expired");
    expect(first.data?.status).toBe("expired");
    expect(await reserved()).toBe(0);
    // a second transition is a no-op and must not release again
    const second = await cancel(id, "expired");
    expect(second.data?.id ?? null).toBeNull();
    await db.rpc("release_order_reservations", { p_order_id: id });
    expect(await reserved()).toBe(0);
  });

  it("the freed portion can be bought again, and more than the limit cannot", async () => {
    const ok = await order(userB, 1);
    expect(ok.error).toBeNull();
    const tooMany = await order(userA, 1);
    expect(tooMany.error?.message).toMatch(/^sold_out/);
    await db.from("menu_days").update({ portion_limit: 10 }).eq("menu_date", date).eq("meal_id", mealId);
  });

  it("releases on reject, auto-cancel and failed payment too", async () => {
    for (const to of ["rejected", "auto_cancelled", "payment_failed"] as const) {
      const before = await reserved();
      const { data } = await order(userA, 2);
      expect(await reserved()).toBe(before + 2);
      if (to !== "payment_failed") {
        await db.rpc("transition_order", { p_order_id: data![0].order_id, p_from: ["pending_payment"], p_to: "new", p_actor_type: "stripe" });
        await cancel(data![0].order_id, to, ["new"]);
      } else {
        await cancel(data![0].order_id, to);
      }
      expect(await reserved()).toBe(before);
    }
  });

  it("does not release when an order is accepted", async () => {
    const before = await reserved();
    const { data } = await order(userA, 1);
    await db.rpc("transition_order", { p_order_id: data![0].order_id, p_from: ["pending_payment"], p_to: "new", p_actor_type: "stripe" });
    await db.rpc("transition_order", { p_order_id: data![0].order_id, p_from: ["new"], p_to: "accepted", p_actor_type: "admin" });
    expect(await reserved()).toBe(before + 1);
  });

  it("enforces the slot's maximum number of orders", async () => {
    // slot max_orders = 2 and there are already two live orders in it (one pending, one accepted)
    const r = await order(userA, 1);
    expect(r.error?.message).toBe("slot_full");
  });

  it("rejects a price that changed in the meantime", async () => {
    const { data: slot } = await db.from("delivery_slots").insert({ starts_at: "13:30", ends_at: "14:00" }).select("id").single();
    createdSlots.push(slot!.id);
    const r = await order(userA, 1, { price: PRICE - 100, slot: slot!.id });
    expect(r.error?.message).toMatch(/^price_changed/);
  });

  it("counts coupon uses under lock and gives them back on cancel", async () => {
    const { data: slot } = await db.from("delivery_slots").insert({ starts_at: "14:00", ends_at: "14:30" }).select("id").single();
    createdSlots.push(slot!.id);
    const { data: coupon } = await db.from("coupons").insert({ code: "DBTEST1", kind: "fixed", amount_off_rappen: 500, max_total_uses: 1 }).select("id").single();
    const withCoupon = (u: string) =>
      db.rpc("create_order", {
        p_user_id: u,
        p_delivery_date: date,
        p_slot_id: slot!.id,
        p_items: [{ meal_id: mealId, quantity: 1, unit_price_rappen: PRICE }],
        p_details: details,
        p_amounts: amounts(PRICE, 500),
        p_coupon_id: coupon!.id,
        p_locale: "de",
      });
    const [a, b] = await Promise.all([withCoupon(userA), withCoupon(userB)]);
    const results = [a, b].map((r) => (r.error ? r.error.message : "ok")).sort();
    expect(results).toEqual(["coupon_exhausted", "ok"]);
    const winner = (a.data ?? b.data)![0].order_id;
    await cancel(winner, "expired");
    const again = await withCoupon(userB);
    expect(again.error).toBeNull();
  });
});
