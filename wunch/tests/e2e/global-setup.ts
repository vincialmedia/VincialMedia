import { ADMIN_EMAIL, PASSWORD, db } from "./helpers";

/** Make sure the admin account exists with a known password (local data only). */
export default async function globalSetup() {
  if (!process.env.STRIPE_API_BASE_URL) {
    throw new Error("E2E tests run against the Stripe emulator: set STRIPE_API_BASE_URL=http://localhost:12111 in .env.local");
  }
  if (!ADMIN_EMAIL) throw new Error("Set ADMIN_EMAILS in .env.local");
  const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 });
  const existing = list.users.find((u) => u.email?.toLowerCase() === ADMIN_EMAIL);
  let id = existing?.id;
  if (existing) await db.auth.admin.updateUserById(existing.id, { password: PASSWORD });
  else id = (await db.auth.admin.createUser({ email: ADMIN_EMAIL, password: PASSWORD, email_confirm: true })).data.user?.id;
  // Admin rights need a proven email address (normally by opening an email link once)
  await db.from("profiles").update({ email_verified_for: ADMIN_EMAIL }).eq("id", id!);
}
