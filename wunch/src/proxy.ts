import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { updateSession } from "./lib/supabase/proxy";

const handleI18nRouting = createMiddleware(routing);

// Pages that need a signed-in user. Real authorisation happens again on the
// server in every page and action; this is only a fast redirect.
const PROTECTED = [/^\/(en\/)?(account|orders|admin)(\/|$)/];

export async function proxy(request: NextRequest) {
  const { claims, applyTo } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  if (!claims && PROTECTED.some((re) => re.test(pathname))) {
    const prefix = pathname.startsWith("/en/") || pathname === "/en" ? "/en" : "";
    const url = request.nextUrl.clone();
    url.pathname = `${prefix}/login`;
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return applyTo(NextResponse.redirect(url));
  }

  return applyTo(handleI18nRouting(request));
}

export const config = {
  // Everything except API routes, auth callbacks, Next internals and files with an extension
  matcher: "/((?!api|auth|_next|_vercel|.*\\..*).*)",
};
