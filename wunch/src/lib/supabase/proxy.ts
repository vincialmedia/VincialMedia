import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session cookie on every request. Returns the claims
 * (or null) plus a function that copies the refreshed cookies onto whatever
 * response the rest of the proxy decides to send.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([key, value]) => supabaseResponse.headers.set(key, value));
        },
      },
    },
  );

  // Do not run code between createServerClient and getClaims.
  const { data } = await supabase.auth.getClaims();

  function applyTo(response: NextResponse) {
    supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
    for (const header of ["cache-control", "expires", "pragma"]) {
      const value = supabaseResponse.headers.get(header);
      if (value) response.headers.set(header, value);
    }
    return response;
  }

  return { claims: data?.claims ?? null, applyTo };
}
