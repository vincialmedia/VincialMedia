import "server-only";
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
 * ADMIN_EMAILS is the source of truth. The profile role mirrors it so that
 * RLS (and Realtime) can check it inside Postgres. Called on sign-in, on
 * every admin check and by the cron job.
 */
export async function syncAdminRole(user: SessionUser): Promise<boolean> {
  const shouldBeAdmin = isAdminEmail(user.email);
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const desired = shouldBeAdmin ? "admin" : "customer";
  if (profile && profile.role !== desired) {
    await admin.from("profiles").update({ role: desired }).eq("id", user.id);
  }
  return shouldBeAdmin;
}

/** For admin pages: redirect to login, or 404 for non-admins. */
export async function requireAdminPage(locale: Locale, nextPath: string): Promise<SessionUser> {
  const user = await requireUser(locale, nextPath);
  if (!(await syncAdminRole(user))) notFound();
  return user;
}

export class ForbiddenError extends Error {
  constructor() {
    super("forbidden");
  }
}

/** For admin Server Actions and Route Handlers: throws unless the caller is an admin. */
export async function assertAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user || !(await syncAdminRole(user))) throw new ForbiddenError();
  return user;
}

/** Keep every profile's role in line with ADMIN_EMAILS (run by cron). */
export async function syncAllAdminRoles(): Promise<void> {
  const admin = createAdminClient();
  const emails = adminEmails();
  const { data: admins } = await admin.from("profiles").select("id, email").eq("role", "admin");
  for (const p of admins ?? []) {
    if (!emails.includes(p.email.toLowerCase())) {
      await admin.from("profiles").update({ role: "customer" }).eq("id", p.id);
    }
  }
  if (emails.length) {
    const { data: candidates } = await admin.from("profiles").select("id, email, role").neq("role", "admin");
    for (const p of candidates ?? []) {
      if (emails.includes(p.email.toLowerCase())) {
        await admin.from("profiles").update({ role: "admin" }).eq("id", p.id);
      }
    }
  }
}
