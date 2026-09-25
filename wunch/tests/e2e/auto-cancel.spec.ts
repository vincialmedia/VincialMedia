import { expect, test } from "@playwright/test";
import { createCustomer, createTestMeal, db, emailsFor, firstOrderableDate, getOrder, login, paymentIntentStatus, placeOrder, runCron } from "./helpers";

test.describe("scheduled job", () => {
  test("rejects calls without the secret", async () => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/cron/tick`, { method: "POST" });
    expect(res.status).toBe(401);
  });

  test("auto-cancels an undecided order 12 hours before the card hold expires", async ({ page }) => {
    const date = await firstOrderableDate();
    const meal = await createTestMeal(date);
    const customer = await createCustomer();
    await login(page, customer.email);
    const orderId = await placeOrder(page, date, meal.name_de);

    // Pretend the hold runs out in 11 hours
    await db.from("orders").update({ capture_before: new Date(Date.now() + 11 * 3_600_000).toISOString() }).eq("id", orderId);
    const res = await runCron();
    expect(res.status).toBe(200);
    expect((await res.json()).autoCancelled).toContain(orderId);

    const order = await getOrder(orderId);
    expect(order.status).toBe("auto_cancelled");
    expect(await paymentIntentStatus(order.stripe_payment_intent_id!)).toBe("canceled");
    expect(await emailsFor(orderId)).toContain("order_auto_cancelled");
    await expect(page.getByTestId("order-status")).toHaveAttribute("data-status", "auto_cancelled", { timeout: 30_000 });
  });

  test("auto-cancels an undecided order when its slot starts", async ({ page }) => {
    const date = await firstOrderableDate();
    const meal = await createTestMeal(date);
    const customer = await createCustomer();
    await login(page, customer.email);
    const orderId = await placeOrder(page, date, meal.name_de);

    await db.from("orders").update({ slot_starts_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", orderId);
    await runCron();
    const order = await getOrder(orderId);
    expect(order.status).toBe("auto_cancelled");
    expect(await paymentIntentStatus(order.stripe_payment_intent_id!)).toBe("canceled");
  });

  test("gives back portions of checkouts that were never paid", async () => {
    const date = await firstOrderableDate();
    const meal = await createTestMeal(date, 3);
    const customer = await createCustomer();
    const { data: slot } = await db.from("delivery_slots").select("id").eq("is_active", true).order("starts_at").limit(1).single();
    const { data: created } = await db.rpc("create_order", {
      p_user_id: customer.id,
      p_delivery_date: date,
      p_slot_id: slot!.id,
      p_items: [{ meal_id: meal.id, quantity: 2, unit_price_rappen: meal.price_rappen }],
      p_details: { customer_name: "X", customer_email: customer.email, street: "Weg 1", postcode: "8952", city: "Schlieren", phone: "079 000 00 00" },
      p_amounts: { subtotal: 3600, discount: 0, delivery_fee: 0, tip: 0, total: 3600 },
      p_coupon_id: null as unknown as string,
      p_locale: "de",
    });
    const orderId = created![0].order_id;
    await db.from("orders").update({ created_at: new Date(Date.now() - 31 * 60_000).toISOString() }).eq("id", orderId);
    await runCron();
    expect((await getOrder(orderId)).status).toBe("expired");
    const { data: day } = await db.from("menu_days").select("portions_reserved").eq("menu_date", date).eq("meal_id", meal.id).single();
    expect(day!.portions_reserved).toBe(0);
  });
});
