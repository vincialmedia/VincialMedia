import { db } from "./helpers";

/** Remove the dishes, orders and customers the tests created. */
export default async function globalTeardown() {
  const { data: meals } = await db.from("meals").select("id").like("name_de", "E2E Gericht%");
  const mealIds = (meals ?? []).map((m) => m.id);
  if (mealIds.length) {
    const { data: items } = await db.from("order_items").select("order_id").in("meal_id", mealIds);
    const orderIds = [...new Set((items ?? []).map((i) => i.order_id))];
    if (orderIds.length) await db.from("orders").delete().in("id", orderIds);
    await db.from("menu_days").update({ portions_reserved: 0 }).in("meal_id", mealIds);
    await db.from("menu_days").delete().in("meal_id", mealIds);
    await db.from("meals").delete().in("id", mealIds);
  }
  const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 });
  for (const u of list.users) {
    if (u.email?.startsWith("e2e-") && u.email.endsWith("@example.com")) await db.auth.admin.deleteUser(u.id);
  }
}
