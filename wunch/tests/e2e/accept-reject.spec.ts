import { expect, test } from "@playwright/test";
import { adminPage, createCustomer, createTestMeal, emailsFor, firstOrderableDate, getOrder, login, paymentIntentStatus, placeOrder } from "./helpers";

test("order, then accept: the payment is captured and the receipt goes out", async ({ page, browser }) => {
  const date = await firstOrderableDate();
  const meal = await createTestMeal(date);
  const customer = await createCustomer();
  await login(page, customer.email);
  const orderId = await placeOrder(page, date, meal.name_de);

  // The customer sees that the card is only reserved
  await expect(page.getByText(/reserviert, aber noch nicht belastet/)).toBeVisible();
  let order = await getOrder(orderId);
  expect(order.status).toBe("new");
  expect(await paymentIntentStatus(order.stripe_payment_intent_id!)).toBe("requires_capture");

  // Vince accepts it on his phone
  const admin = await adminPage(browser);
  await admin.goto("/admin");
  await admin.getByTestId(`accept-${order.order_number}`).click();
  await expect(admin.getByText(`#${order.order_number} angenommen`)).toBeVisible();

  order = await getOrder(orderId);
  expect(order.status).toBe("accepted");
  expect(order.amount_captured_rappen).toBe(order.total_rappen);
  expect(order.stripe_fee_rappen).not.toBeNull();
  expect(await paymentIntentStatus(order.stripe_payment_intent_id!)).toBe("succeeded");
  expect(await emailsFor(orderId)).toEqual(expect.arrayContaining(["order_received", "admin_new_order", "order_accepted"]));

  // The customer's confirmation page updates by itself
  await expect(page.getByTestId("order-status")).toHaveAttribute("data-status", "accepted", { timeout: 30_000 });
});

test("order, then reject: the card hold is released and nothing is charged", async ({ page, browser }) => {
  const date = await firstOrderableDate();
  const meal = await createTestMeal(date, 5);
  const customer = await createCustomer();
  await login(page, customer.email);
  const orderId = await placeOrder(page, date, meal.name_de);
  let order = await getOrder(orderId);

  const { data: before } = await (await import("./helpers")).db.from("menu_days").select("portions_reserved").eq("menu_date", date).eq("meal_id", meal.id).single();
  expect(before!.portions_reserved).toBe(1);

  const admin = await adminPage(browser);
  await admin.goto(`/admin/orders/${orderId}`);
  await admin.getByTestId(`reject-${order.order_number}`).click();
  await admin.getByRole("button", { name: "Leider schon ausverkauft." }).click();
  await admin.getByTestId("confirm-reject").click();
  await expect(admin.getByText(`#${order.order_number} abgelehnt`)).toBeVisible();

  order = await getOrder(orderId);
  expect(order.status).toBe("rejected");
  expect(order.reject_reason).toBe("Leider schon ausverkauft.");
  expect(order.amount_captured_rappen).toBe(0);
  expect(await paymentIntentStatus(order.stripe_payment_intent_id!)).toBe("canceled");
  expect(await emailsFor(orderId)).toContain("order_rejected");

  // the portion is back on sale
  const { data: after } = await (await import("./helpers")).db.from("menu_days").select("portions_reserved").eq("menu_date", date).eq("meal_id", meal.id).single();
  expect(after!.portions_reserved).toBe(0);

  await page.goto(`/orders/${orderId}`);
  await expect(page.getByText("Nicht belastet")).toBeVisible();
  await expect(page.getByText("Grund: Leider schon ausverkauft.")).toBeVisible();
});
