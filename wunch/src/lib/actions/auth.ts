"use server";

import { getSessionUser, syncAdminRole } from "../auth";

/** Called by the browser right after a password or sign-up login. */
export async function afterSignIn(): Promise<{ isAdmin: boolean }> {
  const user = await getSessionUser();
  if (!user) return { isAdmin: false };
  return { isAdmin: await syncAdminRole(user) };
}
