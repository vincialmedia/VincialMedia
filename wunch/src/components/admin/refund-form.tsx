"use client";

import { Loader2, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { refundOrderAction } from "@/lib/actions/admin-orders";
import { formatCHF, parseCHF } from "@/lib/money";
import { useActionToast } from "./order-actions";

export function RefundForm({ orderId, orderNumber, refundableRappen }: { orderId: string; orderNumber: number; refundableRappen: number }) {
  const t = useTranslations("admin.order");
  const tc = useTranslations("admin.common");
  const show = useActionToast();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"full" | "partial">("full");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const partial = parseCHF(amount);
  const value = mode === "full" ? refundableRappen : partial ?? 0;
  const valid = value > 0 && value <= refundableRappen;

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} data-testid="refund-open">
        <Undo2 aria-hidden />
        {t("refund")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={tc("cancel")}>
          <DialogTitle>{t("refundTitle", { number: orderNumber })}</DialogTitle>
          <DialogDescription>{t("refundable", { amount: formatCHF(refundableRappen) })}</DialogDescription>
          <div className="mt-4 space-y-3">
            <fieldset className="space-y-2">
              <label className="flex items-center gap-2">
                <input type="radio" name="mode" checked={mode === "full"} onChange={() => setMode("full")} className="accent-[var(--primary)]" />
                {t("refundFull", { amount: formatCHF(refundableRappen) })}
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="mode" checked={mode === "partial"} onChange={() => setMode("partial")} className="accent-[var(--primary)]" />
                {t("refundPartial")}
              </label>
            </fieldset>
            {mode === "partial" && (
              <div className="space-y-1.5">
                <Label htmlFor="refund-amount">{t("refundAmount")}</Label>
                <Input id="refund-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5.00" aria-invalid={amount !== "" && !valid} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="refund-note">{t("refundNote")}</Label>
              <Textarea id="refund-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
            </div>
            <Button
              className="w-full"
              size="lg"
              disabled={!valid || pending}
              data-testid="refund-confirm"
              onClick={() =>
                startTransition(async () => {
                  const result = await refundOrderAction(orderId, mode === "full" ? "full" : amount, note);
                  show(result, t("refundDone", { amount: formatCHF(value) }));
                  if (result.ok) setOpen(false);
                })
              }
            >
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              {t("refundConfirm", { amount: formatCHF(value) })}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
