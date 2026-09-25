import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, syncAdminRole } from "@/lib/auth";
import { safeNextPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * The email templates link here with redirect_to = the URL the app asked for
 * (e.g. http://site/auth/confirm?next=/checkout). Pull the inner "next" out of it.
 */
function resolveNext(next: string | null, redirectTo: string | null, origin: string): string {
  if (next) return safeNextPath(next);
  if (redirectTo) {
    try {
      const url = new URL(redirectTo, origin);
      if (url.origin === origin) return safeNextPath(url.searchParams.get("next") ?? url.pathname);
    } catch {
      // ignore malformed redirect_to
    }
  }
  return "/";
}

// Target of every auth email (magic link, sign-up confirmation, password reset).
// Handles both token_hash links (work across browsers) and PKCE codes.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = resolveNext(searchParams.get("next"), searchParams.get("redirect_to"), origin);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const supabase = await createClient();

  let ok = false;
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  if (!ok) {
    const prefix = next.startsWith("/en") ? "/en" : "";
    return NextResponse.redirect(new URL(`${prefix}/login?error=link`, origin));
  }

  const user = await getSessionUser();
  if (user) await syncAdminRole(user);
  const target = type === "recovery" ? `${next.startsWith("/en") ? "/en" : ""}/reset-password` : next;
  return NextResponse.redirect(new URL(target, origin));
}
