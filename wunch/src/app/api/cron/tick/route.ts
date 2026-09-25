import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { runTick } from "@/lib/orders/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${env().CRON_SECRET}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Called every 5 minutes by Supabase Cron (pg_cron + pg_net). See README. */
export async function POST(request: Request) {
  if (!authorized(request)) return new Response("unauthorized", { status: 401 });
  const report = await runTick();
  if (report.errors.length) console.error("cron tick errors", report.errors);
  return Response.json(report);
}
