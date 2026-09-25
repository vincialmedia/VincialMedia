"use client";

import { Check, Loader2, Truck, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { acceptOrderAction, markDeliveredAction, rejectOrderAction } from "@/lib/actions/admin-orders";
import type { ActionResult } from "@/lib/orders/lifecycle";

type ErrorCode = "busy" | "wrong_status" | "hold_expired" | "stripe_error" | "invalid_amount" | "already_captured" | "no_payment" | "not_found" | "reason_required" | "forbidden" | "generic";

export function useActionToast() {
  const t = useTranslations("admin.order");
  return (result: ActionResult, success: string) => {
    if (result.ok) toast.success(success);
    else {
      const code = (t.has(`errors.${result.error as ErrorCode}`) ? result.error : "generic") as ErrorCode;
      toast.error(t(`errors.${code}`, { message: result.message ?? "" }));
    }
  };
}

export function OrderActions({ orderId, orderNumber, status, size = "xl" }: { orderId: string; orderNumber: number; status: string; size?: "xl" | "default" }) {
  const t = useTranslations("admin.order");
  const tc = useTranslations("admin.common");
  const show = useActionToast();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"accept" | "reject" | "deliver" | null>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  function act(kind: "accept" | "reject" | "deliver") {
    setBusy(kind);
    startTransition(async () => {
      if (kind === "accept") show(await acceptOrderAction(orderId), t("acceptedToast", { number: orderNumber }));
      if (kind === "deliver") show(await markDeliveredAction(orderId), t("deliveredToast", { number: orderNumber }));
      if (kind === "reject") {
        const result = await rejectOrderAction(orderId, reason);
        show(result, t("rejectedToast", { number: orderNumber }));
        if (result.ok) setOpen(false);
      }
      setBusy(null);
    });
  }

  if (status === "new") {
    return (
      <>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="success" size={size} onClick={() => act("accept")} disabled={pending} data-testid={`accept-${orderNumber}`}>
            {busy === "accept" ? <Loader2 className="animate-spin" aria-hidden /> : <Check className="size-5" aria-hidden />}
            {t("accept")}
          </Button>
          <Button variant="destructive" size={size} onClick={() => setOpen(true)} disabled={pending} data-testid={`reject-${orderNumber}`}>
            <X className="size-5" aria-hidden />
            {t("reject")}
          </Button>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent closeLabel={tc("cancel")}>
            <DialogTitle>{t("rejectTitle", { number: orderNumber })}</DialogTitle>
            <DialogDescription className="sr-only">{t("rejectReason")}</DialogDescription>
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                {(["soldOut", "area", "closed"] as const).map((k) => (
                  <Button key={k} type="button" variant="secondary" size="sm" onClick={() => setReason(t(`quickReasons.${k}`))}>
                    {t(`quickReasons.${k}`)}
                  </Button>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`reason-${orderId}`}>{t("rejectReason")}</Label>
                <Textarea id={`reason-${orderId}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("rejectPlaceholder")} maxLength={500} />
              </div>
              <Button variant="destructive" size="lg" className="w-full" onClick={() => act("reject")} disabled={pending || !reason.trim()} data-testid="confirm-reject">
                {busy === "reject" && <Loader2 className="animate-spin" aria-hidden />}
                {t("confirmReject")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (status === "accepted") {
    return (
      <Button variant="outline" size={size === "xl" ? "lg" : "default"} className="w-full" onClick={() => act("deliver")} disabled={pending} data-testid={`deliver-${orderNumber}`}>
        {busy === "deliver" ? <Loader2 className="animate-spin" aria-hidden /> : <Truck aria-hidden />}
        {t("delivered")}
      </Button>
    );
  }

  return null;
}
