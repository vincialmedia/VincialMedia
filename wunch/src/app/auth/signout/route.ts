import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const locale = request.nextUrl.searchParams.get("locale");
  return NextResponse.redirect(new URL(locale === "en" ? "/en" : "/", request.nextUrl.origin), { status: 303 });
}
