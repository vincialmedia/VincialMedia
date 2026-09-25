"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useRouter } from "@/i18n/navigation";
import { deleteCoupon, saveCoupon } from "@/lib/actions/admin-coupons";
import { rappenToInput } from "@/lib/money";
import type { Tables } from "@/lib/supabase/database.types";

export function CouponForm({ coupon }: { coupon: Tables<"coupons"> | null }) {
  const t = useTranslations("admin.coupons");
  const tc = useTranslations("admin.common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<"percent" | "fixed">((coupon?.kind as "percent" | "fixed") ?? "percent");
  const [invalid, setInvalid] = useState<string[]>([]);
  const bad = (f: string) => invalid.includes(f) || undefined;

  function submit(formData: FormData) {
    if (coupon) formData.set("id", coupon.id);
    startTransition(async () => {
      const r = await saveCoupon(formData);
      if (r.ok) {
        toast.success(t("saved"));
        router.push("/admin/coupons");
      } else {
        setInvalid(r.fields ?? []);
        toast.error(r.error === "code_taken" ? t("codeTaken") : r.error === "invalid" ? tc("invalid") : tc("error", { message: r.error }));
      }
    });
  }

  return (
    <form action={submit} className="space-y-5">
      <section className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 sm:p-5">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="code">{t("code")}</Label>
          <Input id="code" name="code" defaultValue={coupon?.code} required maxLength={32} autoCapitalize="characters" className="font-mono uppercase" aria-invalid={bad("code")} aria-describedby="code-hint" />
          <p id="code-hint" className="text-xs text-muted-foreground">
            {t("codeHint")}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="kind">{t("kind")}</Label>
          <Select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as "percent" | "fixed")}>
            <option value="percent">{t("percent")}</option>
            <option value="fixed">{t("fixed")}</option>
          </Select>
        </div>
        {kind === "percent" ? (
          <div className="space-y-1.5">
            <Label htmlFor="percentOff">{t("percentOff")}</Label>
            <Input id="percentOff" name="percentOff" type="number" min={1} max={100} defaultValue={coupon?.percent_off ?? 10} aria-invalid={bad("percentOff")} />
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="amountOff">{t("amountOff")}</Label>
            <Input id="amountOff" name="amountOff" inputMode="decimal" defaultValue={coupon?.amount_off_rappen ? rappenToInput(coupon.amount_off_rappen) : "5.00"} aria-invalid={bad("amountOff")} />
          </div>
        )}
        <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
          <Checkbox name="isActive" defaultChecked={coupon?.is_active ?? true} />
          {t("active")}
        </label>
      </section>

      <section className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 sm:p-5">
        <div className="space-y-1.5">
          <Label htmlFor="validFrom">{t("validFrom")}</Label>
          <Input id="validFrom" name="validFrom" type="date" defaultValue={coupon?.valid_from ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="validTo">{t("validTo")}</Label>
          <Input id="validTo" name="validTo" type="date" defaultValue={coupon?.valid_to ?? ""} aria-invalid={bad("validTo")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="maxTotal">{t("maxTotal")}</Label>
          <Input id="maxTotal" name="maxTotal" type="number" min={1} defaultValue={coupon?.max_total_uses ?? ""} placeholder="∞" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="maxPerCustomer">{t("maxPerCustomer")}</Label>
          <Input id="maxPerCustomer" name="maxPerCustomer" type="number" min={1} defaultValue={coupon?.max_uses_per_customer ?? ""} placeholder="∞" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="minOrder">{t("minOrder")}</Label>
          <Input id="minOrder" name="minOrder" inputMode="decimal" defaultValue={coupon ? rappenToInput(coupon.min_order_rappen) : "0.00"} aria-invalid={bad("minOrder")} />
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium">
          <Checkbox name="firstOrderOnly" defaultChecked={coupon?.first_order_only ?? false} />
          {t("firstOrder")}
        </label>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {tc("save")}
        </Button>
        {coupon && !coupon.archived_at && (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive"
            disabled={pending}
            onClick={() => {
              if (!confirm(t("confirmDelete", { code: coupon.code }))) return;
              startTransition(async () => {
                const r = await deleteCoupon(coupon.id);
                if (r.ok) {
                  toast.success(r.archived ? t("archived") : t("deleted"));
                  router.push("/admin/coupons");
                } else toast.error(tc("error", { message: r.error }));
              });
            }}
          >
            <Trash2 aria-hidden />
            {tc("delete")}
          </Button>
        )}
      </div>
    </form>
  );
}
