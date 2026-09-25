import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/lib/supabase/database.types";
import { amounts, db, details, futureDate } from "./helpers";

// Row Level Security, checked with real signed-in clients (publishable key + user JWT).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const anon = createClient<Database>(url, key, { auth: { persistSession: false } });
const users: { id: string; email: string; client: SupabaseClient<Database> }[] = [];
let orderOfA: string;
const date = futureDate(24);

async function signedIn(email: string) {
  const client = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: "testtest123" });
  if (error) throw error;
  return client;
}

beforeAll(async () => {
  for (const name of ["rls-a", "rls-b"]) {
    const email = `${name}-${Date.now()}@example.com`;
    const { data } = await db.auth.admin.createUser({ email, password: "testtest123", email_confirm: true });
    users.push({ id: data.user!.id, email, client: await signedIn(email) });
  }
  const { data: meal } = await db.from("meals").select("id, price_rappen").eq("is_active", true).is("archived_at", null).eq("always_available", false).limit(1).single();
  await db.from("menu_days").upsert({ menu_date: date, meal_id: meal!.id, portion_limit: null });
  const { data: slot } = await db.from("delivery_slots").select("id").eq("is_active", true).limit(1).single();
  const { data, error } = await db.rpc("create_order", {
    p_user_id: users[0].id,
    p_delivery_date: date,
    p_slot_id: slot!.id,
    p_items: [{ meal_id: meal!.id, quantity: 1, unit_price_rappen: meal!.price_rappen }],
    p_details: details,
    p_amounts: amounts(meal!.price_rappen),
    p_coupon_id: null as unknown as string,
    p_locale: "de",
  });
  if (error) throw error;
  orderOfA = data[0].order_id;
});

afterAll(async () => {
  await db.from("orders").delete().eq("id", orderOfA);
  await db.from("menu_days").update({ portions_reserved: 0 }).eq("menu_date", date);
  await db.from("menu_days").delete().eq("menu_date", date);
  for (const u of users) await db.auth.admin.deleteUser(u.id);
});

describe("row level security", () => {
  it("customers only see their own orders and order items", async () => {
    const [a, b] = users;
    expect((await a.client.from("orders").select("id").eq("id", orderOfA)).data).toHaveLength(1);
    expect((await b.client.from("orders").select("id").eq("id", orderOfA)).data).toHaveLength(0);
    expect((await b.client.from("order_items").select("id").eq("order_id", orderOfA)).data).toHaveLength(0);
    expect((await anon.from("orders").select("id")).data ?? []).toHaveLength(0);
  });

  it("customers cannot create or change orders directly", async () => {
    const [a] = users;
    const update = await a.client.from("orders").update({ total_rappen: 1 }).eq("id", orderOfA).select();
    expect(update.data ?? []).toHaveLength(0);
    const { data: order } = await db.from("orders").select("total_rappen").eq("id", orderOfA).single();
    expect(order!.total_rappen).toBeGreaterThan(1);
    const rpc = await a.client.rpc("create_order", {
      p_user_id: a.id,
      p_delivery_date: date,
      p_slot_id: "00000000-0000-0000-0000-000000000000",
      p_items: [],
      p_details: {},
      p_amounts: {},
      p_coupon_id: null as unknown as string,
      p_locale: "de",
    });
    expect(rpc.error).not.toBeNull();
  });

  it("customers can edit their own profile but never their role", async () => {
    const [a, b] = users;
    const ok = await a.client.from("profiles").update({ company: "Neue Firma" }).eq("id", a.id).select("company");
    expect(ok.data?.[0]?.company).toBe("Neue Firma");
    const role = await a.client.from("profiles").update({ role: "admin" }).eq("id", a.id);
    expect(role.error).not.toBeNull();
    const other = await a.client.from("profiles").update({ company: "Hacked" }).eq("id", b.id).select();
    expect(other.data ?? []).toHaveLength(0);
    expect((await a.client.from("profiles").select("id")).data).toHaveLength(1);
  });

  it("the shop settings are public, the private notification address is not", async () => {
    expect((await anon.from("settings").select("delivery_postcodes").single()).data?.delivery_postcodes).toContain("8952");
    expect((await anon.from("settings").select("notify_email").single()).error).not.toBeNull();
    expect((await users[0].client.from("settings").select("*").single()).error).not.toBeNull();
  });

  it("customers cannot mark their own email as verified", async () => {
    const [a] = users;
    const r = await a.client.from("profiles").update({ email_verified_for: a.email }).eq("id", a.id);
    expect(r.error).not.toBeNull();
  });

  it("menu data is public, coupons are not", async () => {
    expect((await anon.from("meals").select("id").limit(1)).data?.length).toBe(1);
    expect((await anon.from("delivery_slots").select("id").limit(1)).data?.length).toBe(1);
    expect((await anon.from("coupons").select("code")).data ?? []).toHaveLength(0);
    expect((await users[0].client.from("coupons").select("code")).data ?? []).toHaveLength(0);
  });

  it("customers cannot touch the catalogue or settings", async () => {
    const [a] = users;
    const insert = await a.client.from("meals").insert({ name_de: "x", name_en: "x", price_rappen: 100 });
    expect(insert.error).not.toBeNull();
    const settings = await a.client.from("settings").update({ delivery_fee_rappen: 0 }).eq("id", true).select();
    expect(settings.data ?? []).toHaveLength(0);
    const reserve = await a.client.from("menu_days").update({ portions_reserved: 0 }).eq("menu_date", date);
    expect(reserve.error).not.toBeNull();
  });
});
