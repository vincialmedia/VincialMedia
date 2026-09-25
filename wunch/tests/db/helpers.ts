import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import type { Database } from "../../src/lib/supabase/database.types";

export function loadEnv() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  } catch {
    // CI provides real env vars
  }
}

loadEnv();

export const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function createTestUser(prefix = "dbtest"): Promise<string> {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const { data, error } = await db.auth.admin.createUser({ email, password: "testtest123", email_confirm: true });
  if (error || !data.user) throw error ?? new Error("no user");
  return data.user.id;
}

/** A weekday far enough in the future that its slots haven't started. */
export function futureDate(daysAhead = 20): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export const details = {
  customer_name: "Test Kunde",
  customer_email: "test@example.com",
  company: "Test AG",
  street: "Teststrasse 1",
  postcode: "8952",
  city: "Schlieren",
  floor_room: "",
  phone: "079 000 00 00",
  delivery_note: "",
};

export function amounts(subtotal: number, discount = 0) {
  return { subtotal, discount, delivery_fee: 0, tip: 0, tip_percent: null, total: subtotal - discount, vat_rate_bp: 0, vat: 0 };
}
