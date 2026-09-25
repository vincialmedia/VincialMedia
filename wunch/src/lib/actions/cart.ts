"use server";

import { z } from "zod";
import { getMenuForDate } from "../data/menu";
import { getClosedDates, getSettings, toCalendarSettings } from "../data/settings";
import { getOrderableDates, zurichNow } from "../schedule";

export type CartCheck = {
  orderableDates: string[];
  dateOk: boolean;
  items: Record<
    string,
    { available: boolean; soldOut: boolean; portionsLeft: number | null; priceRappen: number; nameDe: string; nameEn: string; imagePath: string | null }
  >;
};

const input = z.object({ date: z.string().nullable(), mealIds: z.array(z.string()).max(50) });

/** Fresh availability and prices for what's in the browser cart. */
export async function checkCart(raw: { date: string | null; mealIds: string[] }): Promise<CartCheck> {
  const { date, mealIds } = input.parse(raw);
  const now = new Date();
  const settings = await getSettings();
  const orderableDates = getOrderableDates(now, toCalendarSettings(settings), await getClosedDates(zurichNow(now).date));
  const dateOk = !!date && orderableDates.includes(date);
  const items: CartCheck["items"] = {};
  if (date && dateOk) {
    const menu = await getMenuForDate(date);
    for (const id of mealIds) {
      const item = menu.find((m) => m.meal.id === id);
      if (item) {
        items[id] = {
          available: !item.soldOut,
          soldOut: item.soldOut,
          portionsLeft: item.portionsLeft,
          priceRappen: item.meal.price_rappen,
          nameDe: item.meal.name_de,
          nameEn: item.meal.name_en,
          imagePath: item.meal.image_path,
        };
      }
    }
  }
  return { orderableDates, dateOk, items };
}
