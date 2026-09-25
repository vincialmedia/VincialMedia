import { type Browser, type Page, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/supabase/database.types";
import { getOrderableDates } from "../../src/lib/schedule";

export const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const PASSWORD = "e2e-password-123";
export const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
export const ADMIN_EMAIL = ADMIN_EMAILS[0] ?? "";
export const EMULATOR = process.env.STRIPE_API_BASE_URL ?? "http://localhost:12111";

export async function createCustomer(): Promise<{ id: string; email: string }> {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const { data, error } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("user");
  return { id: data.user.id, email };
}

export async function firstOrderableDate(): Promise<string> {
  const { data: s } = await db.from("settings").select("*").single();
  const { data: closed } = await db.from("closed_dates").select("closed_on");
  const dates = getOrderableDates(new Date(), { sameDayCutoff: s!.same_day_cutoff, maxDaysAhead: s!.max_days_ahead, deliveryWeekdays: s!.delivery_weekdays }, (closed ?? []).map((c) => c.closed_on));
  if (!dates.length) throw new Error("No orderable dates: check settings");
  // tomorrow-or-later keeps slots from starting during the test
  return dates.find((d) => d > new Date().toISOString().slice(0, 10)) ?? dates[0];
}

/** A dedicated meal on the menu for `date`, so tests don't depend on seed data. */
export async function createTestMeal(date: string, portionLimit: number | null = 20) {
  const name = `E2E Gericht ${Math.random().toString(36).slice(2, 7)}`;
  const { data: meal, error } = await db
    .from("meals")
    .insert({ name_de: name, name_en: `${name} EN`, description_de: "Testgericht", description_en: "Test meal", price_rappen: 1800, category: "main", sort_order: -100 })
    .select("*")
    .single();
  if (error) throw error;
  await db.from("menu_days").insert({ menu_date: date, meal_id: meal.id, portion_limit: portionLimit });
  return meal;
}

export async function login(page: Page, email: string, password = PASSWORD, next = "/") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.fill("#auth-email", email);
  await page.fill("#auth-password", password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page.waitForURL((url) => url.pathname === next, { timeout: 30_000 });
}

export async function addToCart(page: Page, date: string, mealName: string) {
  await page.goto(`/?date=${date}`);
  await page.getByRole("button", { name: `${mealName} in den Warenkorb` }).click();
  await expect(page.getByRole("link", { name: /Warenkorb, 1 Artikel/ })).toBeVisible();
}

export async function fillCheckout(page: Page, postcode = "8952") {
  await page.goto("/checkout");
  await page.fill("#co-fullName", "E2E Kundin");
  await page.fill("#co-company", "Testfirma AG");
  await page.fill("#co-street", "Wiesenstrasse 5");
  await page.fill("#co-postcode", postcode);
  await page.fill("#co-city", "Schlieren");
  await page.fill("#co-phone", "079 555 66 77");
  await expect(page.getByTestId("checkout-total")).not.toHaveText("…");
}

/** Full customer flow through the UI; returns the order id. */
export async function placeOrder(page: Page, date: string, mealName: string): Promise<string> {
  await addToCart(page, date, mealName);
  await fillCheckout(page);
  await page.getByTestId("pay-button").click();
  await page.waitForURL(/\/checkout\/success\?order=/, { timeout: 30_000 });
  await expect(page.getByTestId("order-status")).toHaveAttribute("data-status", "new");
  return new URL(page.url()).searchParams.get("order")!;
}

export async function adminPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ locale: "de-CH", timezoneId: "Europe/Zurich" });
  const page = await context.newPage();
  await login(page, ADMIN_EMAIL, PASSWORD, "/admin");
  return page;
}

export async function getOrder(id: string) {
  const { data } = await db.from("orders").select("*").eq("id", id).single();
  return data!;
}

export async function paymentIntentStatus(piId: string): Promise<string> {
  const state = (await (await fetch(`${EMULATOR}/_emulator/state`)).json()) as { payment_intents: { id: string; status: string }[] };
  return state.payment_intents.find((p) => p.id === piId)?.status ?? "missing";
}

export async function emailsFor(orderId: string): Promise<string[]> {
  const { data } = await db.from("email_log").select("template").eq("order_id", orderId);
  return (data ?? []).map((e) => e.template);
}

export async function runCron(): Promise<Response> {
  return fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/cron/tick`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
}
