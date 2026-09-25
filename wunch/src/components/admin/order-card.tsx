import { Clock, MapPin, MessageSquare, Phone } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { StatusBadge } from "@/components/orders/status-badge";
import { Link } from "@/i18n/navigation";
import type { AdminOrder } from "@/lib/data/admin";
import { formatDateTime, formatDayShort, formatSlotInstants } from "@/lib/format";
import { formatCHF } from "@/lib/money";
import { autoCancelAt } from "@/lib/schedule";
import { cn } from "@/lib/utils";
import { OrderActions } from "./order-actions";

/** One order on the Today view: everything needed to decide and to deliver. */
export async function OrderCard({ order, showDate = false }: { order: AdminOrder; showDate?: boolean }) {
  const t = await getTranslations("admin.order");
  const tt = await getTranslations("admin.today");
  const locale = await getLocale();
  const decideBy = autoCancelAt(new Date(order.slot_starts_at), order.capture_before ? new Date(order.capture_before) : null);

  return (
    <article
      className={cn("rounded-xl border bg-card p-4 shadow-xs", order.status === "new" && "border-warning/60 ring-2 ring-warning/30")}
      data-testid={`order-${order.order_number}`}
      data-status={order.status}
    >
      <header className="mb-2 flex items-start justify-between gap-3">
        <div>
          <Link href={`/admin/orders/${order.id}`} className="text-lg font-extrabold hover:text-primary">
            #{order.order_number}
          </Link>
          {showDate && (
            <span className="ml-2 text-sm font-semibold">
              {formatDayShort(order.delivery_date, locale)} {formatSlotInstants(order.slot_starts_at, order.slot_ends_at)}
            </span>
          )}
          <p className="text-xs text-muted-foreground">{t("placedAt", { time: formatDateTime(order.created_at) })}</p>
        </div>
        <div className="text-right">
          <StatusBadge status={order.status} />
          <p className="mt-1 font-heading text-lg font-extrabold tabular-nums">{formatCHF(order.total_rappen)}</p>
        </div>
      </header>

      <ul className="mb-3 space-y-0.5 text-[15px] font-semibold">
        {order.order_items.map((i) => (
          <li key={i.id}>
            {i.quantity} × {locale === "en" ? i.name_en : i.name_de}
          </li>
        ))}
      </ul>

      <div className="space-y-1.5 text-sm">
        <p className="font-semibold">
          {order.customer_name}
          {order.company && <span className="font-normal"> · {order.company}</span>}
        </p>
        <p className="flex items-start gap-1.5">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span>
            {order.street}, {order.postcode} {order.city}
            {order.floor_room && <strong> · {order.floor_room}</strong>}
          </span>
        </p>
        <p className="flex items-center gap-1.5">
          <Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <a href={`tel:${order.phone.replace(/[^+0-9]/g, "")}`} className="font-medium text-primary underline-offset-2 hover:underline" aria-label={`${t("call")} ${order.phone}`}>
            {order.phone}
          </a>
        </p>
        {order.delivery_note && (
          <p className="flex items-start gap-1.5 rounded-lg bg-warning-soft px-2 py-1.5 text-warning">
            <MessageSquare className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{order.delivery_note}</span>
          </p>
        )}
        {order.coupon_code && (
          <p className="text-xs text-muted-foreground">
            {t("coupon")}: {order.coupon_code} (−{formatCHF(order.discount_rappen)})
          </p>
        )}
        {order.status === "new" && (
          <p className="flex items-center gap-1.5 text-sm font-semibold text-warning">
            <Clock className="size-4" aria-hidden />
            {tt("decideBy", { time: formatDateTime(decideBy) })}
          </p>
        )}
      </div>

      <div className="mt-3">
        <OrderActions orderId={order.id} orderNumber={order.order_number} status={order.status} />
      </div>
    </article>
  );
}
