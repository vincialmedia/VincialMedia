"use client";

import { RotateCcw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { cartActions } from "@/components/cart/cart-store";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { reorder } from "@/lib/actions/orders";
import { formatDayShort } from "@/lib/format";

export function ReorderButton({ orderId, size = "sm" }: { orderId: string; size?: "sm" | "default" }) {
  const t = useTranslations("orders");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size={size}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await reorder(orderId);
          if (!res.ok) {
            toast.error(t("reorderNothing"));
            return;
          }
          cartActions.replace({ date: res.date, lines: res.lines });
          toast.success(t("reorderDone", { date: formatDayShort(res.date, locale) }));
          router.push("/cart");
        })
      }
    >
      <RotateCcw aria-hidden />
      {t("reorder")}
    </Button>
  );
}
