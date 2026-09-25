import { expect, test } from "@playwright/test";
import { addToCart, createCustomer, createTestMeal, db, fillCheckout, firstOrderableDate, login } from "./helpers";

test("a postcode outside the delivery area is blocked before payment", async ({ page }) => {
  const date = await firstOrderableDate();
  const meal = await createTestMeal(date);
  const customer = await createCustomer();
  await login(page, customer.email);
  await addToCart(page, date, meal.name_de);
  await fillCheckout(page, "8000");

  await expect(page.getByText("Wir liefern im Moment nur nach 8952.").first()).toBeVisible();
  await page.getByTestId("pay-button").click();
  await expect(page.getByTestId("pay-error")).toContainText("Wir liefern im Moment nur nach 8952.");

  const { count } = await db.from("orders").select("id", { count: "exact", head: true }).eq("user_id", customer.id);
  expect(count).toBe(0);

  // With the right postcode it goes through
  await page.fill("#co-postcode", "8952");
  await page.getByTestId("pay-button").click();
  await page.waitForURL(/\/checkout\/success\?order=/);
});
