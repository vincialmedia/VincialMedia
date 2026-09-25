"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type SettingsResult, addClosedDate, deleteSlot, removeClosedDate, saveSettings, saveSlot } from "@/lib/actions/admin-settings";
import { formatDayLong, formatWeekday } from "@/lib/format";
import { rappenToInput } from "@/lib/money";
import { shortTime } from "@/lib/schedule";
import type { Tables } from "@/lib/supabase/database.types";

function useReport() {
  const tc = useTranslations("admin.common");
  const t = useTranslations("admin.settings");
  return (r: SettingsResult, success: string) => {
    if (r.ok) toast.success(success);
    else toast.error(r.error === "slot_in_use" ? t("slotInUse") : r.error === "invalid" ? tc("invalid") : tc("error", { message: r.error }));
  };
}

export function SettingsForm({ settings }: { settings: Tables<"settings"> }) {
  const t = useTranslations("admin.settings");
  const tc = useTranslations("admin.common");
  const locale = useLocale();
  const report = useReport();
  const [pending, startTransition] = useTransition();
  const [invalid, setInvalid] = useState<string[]>([]);
  const bad = (f: string) => invalid.includes(f) || undefined;
  // a Monday, for weekday names
  const weekday = (n: number) => formatWeekday(`2026-09-${String(20 + n).padStart(2, "0")}`, locale, "long");

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const r = await saveSettings(fd);
          setInvalid(r.ok ? [] : (r.fields ?? []));
          report(r, t("saved"));
        })
      }
      className="space-y-5"
    >
      <section className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 sm:p-5">
        <h2 className="text-lg font-bold sm:col-span-2">{t("ordering")}</h2>
        <div className="space-y-1.5">
          <Label htmlFor="sameDayCutoff">{t("cutoff")}</Label>
          <Input id="sameDayCutoff" name="sameDayCutoff" type="time" defaultValue={shortTime(settings.same_day_cutoff)} aria-invalid={bad("sameDayCutoff")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="maxDaysAhead">{t("daysAhead")}</Label>
          <Input id="maxDaysAhead" name="maxDaysAhead" type="number" min={0} max={6} defaultValue={settings.max_days_ahead} aria-describedby="daysAheadHint" aria-invalid={bad("maxDaysAhead")} />
          <p id="daysAheadHint" className="text-xs text-muted-foreground">
            {t("daysAheadHint")}
          </p>
        </div>
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-sm font-medium">{t("weekdays")}</legend>
          <div className="flex flex-wrap gap-3">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <label key={n} className="flex items-center gap-2 text-sm">
                <Checkbox name="deliveryWeekdays" value={n} defaultChecked={settings.delivery_weekdays.includes(n)} />
                {weekday(n)}
              </label>
            ))}
          </div>
          {bad("deliveryWeekdays") && <p className="mt-1 text-sm text-destructive">{t("errors.weekdays")}</p>}
        </fieldset>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="deliveryPostcodes">{t("postcodes")}</Label>
          <Input id="deliveryPostcodes" name="deliveryPostcodes" defaultValue={settings.delivery_postcodes.join(", ")} aria-invalid={bad("deliveryPostcodes")} />
          {bad("deliveryPostcodes") && <p className="text-sm text-destructive">{t("errors.postcodes")}</p>}
        </div>
      </section>

      <section className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 sm:p-5">
        <h2 className="text-lg font-bold sm:col-span-2">{t("pricing")}</h2>
        <div className="space-y-1.5">
          <Label htmlFor="minOrder">{t("minOrder")}</Label>
          <Input id="minOrder" name="minOrder" inputMode="decimal" defaultValue={rappenToInput(settings.min_order_rappen)} aria-invalid={bad("minOrder")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="deliveryFee">{t("deliveryFee")}</Label>
          <Input id="deliveryFee" name="deliveryFee" inputMode="decimal" defaultValue={rappenToInput(settings.delivery_fee_rappen)} aria-invalid={bad("deliveryFee")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tipPercentages">{t("tips")}</Label>
          <Input id="tipPercentages" name="tipPercentages" defaultValue={settings.tip_percentages.join(", ")} aria-invalid={bad("tipPercentages")} />
          {bad("tipPercentages") && <p className="text-sm text-destructive">{t("errors.tips")}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vatRate">{t("vatRate")}</Label>
          <Input id="vatRate" name="vatRate" inputMode="decimal" defaultValue={(settings.vat_rate_bp / 100).toString()} aria-invalid={bad("vatRate")} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="vatNumber">{t("vatNumber")}</Label>
          <Input id="vatNumber" name="vatNumber" defaultValue={settings.vat_number ?? ""} />
        </div>
      </section>

      <section className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 sm:p-5">
        <h2 className="text-lg font-bold sm:col-span-2">{t("business")}</h2>
        <div className="space-y-1.5">
          <Label htmlFor="businessName">{t("businessName")}</Label>
          <Input id="businessName" name="businessName" defaultValue={settings.business_name} aria-invalid={bad("businessName")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="businessEmail">{t("businessEmail")}</Label>
          <Input id="businessEmail" name="businessEmail" type="email" defaultValue={settings.business_email ?? ""} aria-invalid={bad("businessEmail")} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="businessAddress">{t("businessAddress")}</Label>
          <Textarea id="businessAddress" name="businessAddress" rows={2} defaultValue={settings.business_address} aria-invalid={bad("businessAddress")} />
        </div>
      </section>

      <section className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 sm:p-5">
        <h2 className="text-lg font-bold sm:col-span-2">{t("notifications")}</h2>
        <div className="space-y-1.5">
          <Label htmlFor="notifyEmail">{t("notifyEmail")}</Label>
          <Input id="notifyEmail" name="notifyEmail" type="email" defaultValue={settings.notify_email ?? ""} aria-invalid={bad("notifyEmail")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reminderMinutes">{t("reminder")}</Label>
          <Input id="reminderMinutes" name="reminderMinutes" type="number" min={1} max={240} defaultValue={settings.undecided_reminder_minutes} aria-invalid={bad("reminderMinutes")} />
        </div>
      </section>

      <p className="text-sm text-muted-foreground">{t("fixed")}</p>
      <Button type="submit" size="lg" disabled={pending}>
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {tc("save")}
      </Button>
    </form>
  );
}

function SlotRow({ slot, onSaved }: { slot?: Tables<"delivery_slots">; onSaved?: () => void }) {
  const t = useTranslations("admin.settings");
  const tc = useTranslations("admin.common");
  const report = useReport();
  const [pending, startTransition] = useTransition();
  const [startsAt, setStartsAt] = useState(slot ? shortTime(slot.starts_at) : "13:15");
  const [endsAt, setEndsAt] = useState(slot ? shortTime(slot.ends_at) : "13:45");
  const [maxOrders, setMaxOrders] = useState(slot?.max_orders?.toString() ?? "");
  const [isActive, setIsActive] = useState(slot?.is_active ?? true);
  return (
    <li className="grid grid-cols-2 items-end gap-2 border-b pb-3 last:border-0 sm:grid-cols-[1fr_1fr_1fr_auto_auto]">
      <div className="space-y-1">
        <Label className="text-xs">{t("slotStart")}</Label>
        <Input type="time" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">{t("slotEnd")}</Label>
        <Input type="time" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">{t("slotMax")}</Label>
        <Input type="number" min={1} value={maxOrders} placeholder="∞" onChange={(e) => setMaxOrders(e.target.value)} />
      </div>
      <label className="flex h-11 items-center gap-2 text-sm">
        <Checkbox checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        {t("slotActive")}
      </label>
      <div className="flex gap-1">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await saveSlot({ id: slot?.id, startsAt, endsAt, maxOrders, isActive });
              report(r, t("slotSaved"));
              if (r.ok) onSaved?.();
            })
          }
        >
          {tc("save")}
        </Button>
        {slot && (
          <Button size="sm" variant="ghost" className="text-destructive" aria-label={tc("delete")} disabled={pending} onClick={() => startTransition(async () => report(await deleteSlot(slot.id), t("slotDeleted")))}>
            <Trash2 aria-hidden />
          </Button>
        )}
      </div>
    </li>
  );
}

export function SlotsEditor({ slots }: { slots: Tables<"delivery_slots">[] }) {
  const t = useTranslations("admin.settings");
  const [adding, setAdding] = useState(false);
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4 sm:p-5">
      <h2 className="text-lg font-bold">{t("slots")}</h2>
      <ul className="space-y-3">
        {slots.map((s) => (
          <SlotRow key={`${s.id}-${s.starts_at}-${s.ends_at}-${s.max_orders}-${s.is_active}`} slot={s} />
        ))}
        {adding && <SlotRow onSaved={() => setAdding(false)} />}
      </ul>
      {!adding && (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus aria-hidden />
          {t("addSlot")}
        </Button>
      )}
    </section>
  );
}

export function ClosedDatesEditor({ dates }: { dates: Tables<"closed_dates">[] }) {
  const t = useTranslations("admin.settings");
  const tc = useTranslations("admin.common");
  const locale = useLocale();
  const report = useReport();
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4 sm:p-5">
      <div>
        <h2 className="text-lg font-bold">{t("closed")}</h2>
        <p className="text-sm text-muted-foreground">{t("closedHint")}</p>
      </div>
      {dates.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("closedEmpty")}</p>
      ) : (
        <ul className="divide-y">
          {dates.map((d) => (
            <li key={d.closed_on} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span>
                <strong>{formatDayLong(d.closed_on, locale)}</strong>
                {d.reason && <span className="text-muted-foreground"> · {d.reason}</span>}
              </span>
              <Button size="sm" variant="ghost" className="text-destructive" aria-label={`${tc("delete")} ${d.closed_on}`} disabled={pending} onClick={() => startTransition(async () => report(await removeClosedDate(d.closed_on), tc("saved")))}>
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="closed-date" className="text-xs">
            {t("closedDate")}
          </Label>
          <Input id="closed-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="closed-reason" className="text-xs">
            {t("closedReason")}
          </Label>
          <Input id="closed-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
        </div>
        <Button
          disabled={pending || !date}
          onClick={() =>
            startTransition(async () => {
              const r = await addClosedDate(date, reason);
              report(r, tc("saved"));
              if (r.ok) {
                setDate("");
                setReason("");
              }
            })
          }
        >
          {t("addClosed")}
        </Button>
      </div>
    </section>
  );
}
