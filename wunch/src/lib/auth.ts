import "server-only";
import { randomBytes } from "node:crypto";
import { notFound } from "next/navigation";
import { cache } from "react";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { adminEmails } from "./env";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

export type SessionUser = { id: string; email: string };

/** The signed-in user (JWT verified by Supabase), or null. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: String(claims.email ?? "").toLowerCase() };
});

export const getProfile = cache(async (userId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  return data;
});

export async function requireUser(locale: Locale, nextPath: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect({ href: { pathname: "/login", query: { next: nextPath } }, locale });
  }
  return user!;
}

export function isAdminEmail(email: string): boolean {
  return adminEmails().includes(email.toLowerCase());
}

/**
 * ADMIN_EMAILS is the source of truth, but only for an account that proved it
 * owns the address by opening an email link (see recordVerifiedEmail). Without
 * that, anyone could sign up with an admin address nobody has registered yet.
 * The profile role mirrors the result so RLS (and Realtime) can check it in
 * Postgres. Called on sign-in, on every admin check and by the cron job.
 */
export async function syncAdminRole(user: SessionUser): Promise<boolean> {
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role, email_verified_for").eq("id", user.id).maybeSingle();
  const verified = !!user.email && profile?.email_verified_for?.toLowerCase() === user.email;
  const shouldBeAdmin = isAdminEmail(user.email) && verified;
  const desired = shouldBeAdmin ? "admin" : "customer";
  if (profile && profile.role !== desired) {
    await admin.from("profiles").update({ role: desired }).eq("id", user.id);
  }
  return shouldBeAdmin;
}

/**
 * The signed-in user, checked with the Auth server (so a session that was
 * signed out elsewhere no longer counts). Used for admin access.
 */
const getLiveUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: String(data.user.email ?? "").toLowerCase() };
});

/**
 * Called when a user opened an email link (magic link, sign-up confirmation,
 * password reset, email change): they own this address. The first time an
 * admin address is proven, a password someone may have set before is
 * replaced, which also ends every session (a squatter who registered the
 * address first is locked out), and the owner gets a fresh session.
 */
export async function recordVerifiedEmail(user: SessionUser): Promise<void> {
  if (!user.email) return;
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("email_verified_for").eq("id", user.id).maybeSingle();
  if (profile?.email_verified_for?.toLowerCase() === user.email) return;
  await admin.from("profiles").update({ email_verified_for: user.email }).eq("id", user.id);
  if (isAdminEmail(user.email)) {
    // Changing the password revokes all sessions, including the one just created ...
    await admin.auth.admin.updateUserById(user.id, { password: randomBytes(32).toString("base64url") });
    // ... so sign the owner straight back in with a one-time link (no email is sent)
    const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: user.email });
    if (error || !link.properties?.hashed_token) throw new Error(`could not renew admin session: ${error?.message}`);
    const supabase = await createClient();
    await supabase.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  }
}

/** For admin pages: redirect to login, or 404 for non-admins. */
export async function requireAdminPage(locale: Locale, nextPath: string): Promise<SessionUser> {
  await requireUser(locale, nextPath);
  const user = await getLiveUser();
  if (!user || !(await syncAdminRole(user))) notFound();
  return user;
}

export class ForbiddenError extends Error {
  constructor() {
    super("forbidden");
  }
}

/** For admin Server Actions and Route Handlers: throws unless the caller is an admin. */
export async function assertAdmin(): Promise<SessionUser> {
  const user = await getLiveUser();
  if (!user || !(await syncAdminRole(user))) throw new ForbiddenError();
  return user;
}

/** Keep every profile's role in line with ADMIN_EMAILS (run by cron). */
export async function syncAllAdminRoles(): Promise<void> {
  const admin = createAdminClient();
  const emails = adminEmails();
  const { data: admins } = await admin.from("profiles").select("id, email, email_verified_for").eq("role", "admin");
  for (const p of admins ?? []) {
    if (!emails.includes(p.email.toLowerCase()) || p.email_verified_for?.toLowerCase() !== p.email.toLowerCase()) {
      await admin.from("profiles").update({ role: "customer" }).eq("id", p.id);
    }
  }
  if (emails.length) {
    const { data: candidates } = await admin.from("profiles").select("id, email, role, email_verified_for").neq("role", "admin");
    for (const p of candidates ?? []) {
      if (emails.includes(p.email.toLowerCase()) && p.email_verified_for?.toLowerCase() === p.email.toLowerCase()) {
        await admin.from("profiles").update({ role: "admin" }).eq("id", p.id);
      }
    }
  }
}
