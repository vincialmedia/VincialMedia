import { ForbiddenError, assertAdmin } from "@/lib/auth";
import { getPayments, paymentRange } from "@/lib/data/payments";
import { paymentsCsv } from "@/lib/reports";

export const dynamic = "force-dynamic";

/** CSV export of payments: /api/admin/payments?from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function GET(request: Request) {
  try {
    await assertAdmin();
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response("forbidden", { status: 403 });
    throw e;
  }
  const url = new URL(request.url);
  const { from, to } = paymentRange(url.searchParams.get("from") ?? undefined, url.searchParams.get("to") ?? undefined);
  const csv = paymentsCsv(await getPayments(from, to));
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="wunch-zahlungen-${from}-${to}.csv"`,
      "cache-control": "no-store",
    },
  });
}
