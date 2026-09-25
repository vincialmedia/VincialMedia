import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_EMAILS, db } from "./helpers";

// Security regression: an admin address from ADMIN_EMAILS only grants admin
// rights after its owner proved they own the mailbox (opened an email link).
test("signing up with an admin address is not enough to get into /admin", async ({ page }) => {
  const email = ADMIN_EMAILS[1];
  expect(email, "ADMIN_EMAILS needs a second address for this test (see README, Tests)").toBeTruthy();
  const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 });
  for (const u of list.users.filter((u) => u.email?.toLowerCase() === email)) await db.auth.admin.deleteUser(u.id);

  // A squatter registers the address with a password (email confirmation off)
  const squatterPassword = "squatter-password-1";
  await page.goto("/login?mode=signup&next=/");
  await page.fill("#auth-email", email);
  await page.fill("#auth-password", squatterPassword);
  await page.getByRole("button", { name: "Konto erstellen", exact: true }).click();
  await page.waitForURL((u) => u.pathname === "/");
  expect((await page.goto("/admin"))?.status()).toBe(404);

  // The real owner opens a login link sent to that mailbox
  const { data: link } = await db.auth.admin.generateLink({ type: "magiclink", email });
  const owner = await page.context().browser()!.newContext();
  const ownerPage = await owner.newPage();
  await ownerPage.goto(`/auth/confirm?token_hash=${link.properties!.hashed_token}&type=magiclink&next=/admin`);
  await expect(ownerPage).toHaveURL(/\/admin$/);
  await expect(ownerPage.getByRole("heading", { name: "Heute" })).toBeVisible();

  // ... which locks the squatter out: the old password no longer works
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { error } = await anon.auth.signInWithPassword({ email, password: squatterPassword });
  expect(error).not.toBeNull();
  // and the squatter's existing session is gone
  expect((await page.goto("/admin"))?.status()).not.toBe(200);

  const { data: after } = await db.auth.admin.listUsers({ perPage: 1000 });
  for (const u of after.users.filter((u) => u.email?.toLowerCase() === email)) await db.auth.admin.deleteUser(u.id);
});
