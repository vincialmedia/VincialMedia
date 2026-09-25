import { expect, test } from "@playwright/test";
import { addToCart, createCustomer, createTestMeal, db, fillCheckout, firstOrderableDate, login } from "./helpers";

test("a sold-out meal can't be ordered", async ({ page }) => {
  const date = await firstOrderableDate();
  const meal = await createTestMeal(date, 1);
  const customer = await createCustomer();
  await login(page, customer.email);

  // The customer puts the last portion in the cart ...
  await addToCart(page, date, meal.name_de);

  // ... but someone else buys it first
  const other = await createCustomer();
  const { data: slot } = await db.from("delivery_slots").select("id").eq("is_active", true).order("starts_at").limit(1).single();
  const { error } = await db.rpc("create_order", {
    p_user_id: other.id,
    p_delivery_date: date,
    p_slot_id: slot!.id,
    p_items: [{ meal_id: meal.id, quantity: 1, unit_price_rappen: meal.price_rappen }],
    p_details: { customer_name: "Schneller", customer_email: other.email, street: "Weg 1", postcode: "8952", city: "Schlieren", phone: "079 000 00 00" },
    p_amounts: { subtotal: meal.price_rappen, discount: 0, delivery_fee: 0, tip: 0, total: meal.price_rappen },
    p_coupon_id: null as unknown as string,
    p_locale: "de",
  });
  expect(error).toBeNull();

  // Menu shows it as sold out, the button is disabled
  await page.goto(`/?date=${date}`);
  const card = page.locator("article", { hasText: meal.name_de });
  await expect(card.getByText("Ausverkauft")).toBeVisible();
  await expect(card.getByRole("button", { name: `${meal.name_de} in den Warenkorb` })).toBeDisabled();

  // Checkout refuses to take the money
  await fillCheckout(page);
  await expect(page.getByTestId("quote-error")).toContainText("ausverkauft");
  await page.getByTestId("pay-button").click();
  await expect(page.getByTestId("pay-error")).toContainText("ausverkauft");

  const { count } = await db.from("orders").select("id", { count: "exact", head: true }).eq("user_id", customer.id);
  expect(count).toBe(0);
});
