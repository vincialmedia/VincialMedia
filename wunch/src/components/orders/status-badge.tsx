import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { StatusKey } from "@/lib/i18n-keys";

const VARIANT: Record<StatusKey, "default" | "secondary" | "green" | "warning" | "destructive" | "muted" | "outline"> = {
  pending_payment: "muted",
  new: "warning",
  accepted: "green",
  delivered: "secondary",
  rejected: "destructive",
  auto_cancelled: "muted",
  payment_failed: "muted",
  expired: "muted",
  refunded: "outline",
  partially_refunded: "outline",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const t = useTranslations("status");
  const key = status as StatusKey;
  return (
    <Badge variant={VARIANT[key] ?? "muted"} className={className} data-status={status}>
      {t(key)}
    </Badge>
  );
}
