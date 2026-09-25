import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, PASSWORD, addToCart, createCustomer, createTestMeal, firstOrderableDate, login } from "./helpers";

// Automated accessibility checks (WCAG 2.1 A/AA rules from axe-core).
async function audit(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
  expect(summary).toEqual([]);
}

test("customer pages have no detectable accessibility violations", async ({ page }) => {
  const date = await firstOrderableDate();
  const meal = await createTestMeal(date);
  for (const path of ["/", `/meals/${meal.id}?date=${date}`, "/login", "/en", "/impressum"]) {
    await page.goto(path);
    await audit(page);
  }
  const customer = await createCustomer();
  await login(page, customer.email);
  await addToCart(page, date, meal.name_de);
  for (const path of ["/cart", "/checkout", "/account", "/orders"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await audit(page);
  }
});

test("admin pages have no detectable accessibility violations", async ({ page }) => {
  await login(page, ADMIN_EMAIL, PASSWORD, "/admin");
  for (const path of ["/admin", "/admin/orders", "/admin/menu", "/admin/meals/new", "/admin/coupons/new", "/admin/settings", "/admin/payments"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await audit(page);
  }
});
