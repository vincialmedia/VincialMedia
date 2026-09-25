"use client";

import { CopyPlus, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { type MenuResult, copyLastWeek, removeMenuItem, setMenuItem } from "@/lib/actions/admin-menu";
import { formatDayLong } from "@/lib/format";

type Entry = { menu_date: string; meal_id: string; portion_limit: number | null; portions_reserved: number };
type Meal = { id: string; name_de: string; name_en: string; category: string };

export function WeekPlanner({
  monday,
  days,
  closed,
  entries,
  meals,
  alwaysNames,
}: {
  monday: string;
  days: string[];
  closed: Record<string, string>;
  entries: Entry[];
  meals: Meal[];
  alwaysNames: string[];
}) {
  const t = useTranslations("admin.menu");
  const tc = useTranslations("admin.common");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const mealName = (id: string) => {
    const m = meals.find((x) => x.id === id);
    return m ? (locale === "en" ? m.name_en : m.name_de) : "?";
  };

  function report(result: MenuResult, success?: string) {
    if (result.ok) {
      if (success) toast.success(success);
      return;
    }
    toast.error(
      result.error === "has_orders" ? t("errorHasOrders") : result.error === "below_reserved" ? t("limitBelowReserved") : tc("error", { message: result.error }),
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (!confirm(t("copyConfirm"))) return;
            startTransition(async () => {
              const result = await copyLastWeek(monday);
              if (result.ok) toast.success(t("copied", { count: result.count ?? 0 }));
              else report(result);
            });
          }}
        >
          <CopyPlus aria-hidden />
          {t("copyLastWeek")}
        </Button>
        {alwaysNames.length > 0 && <p className="text-sm text-muted-foreground">{t("always", { names: alwaysNames.join(", ") })}</p>}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {days.map((date) => {
          const dayEntries = entries.filter((e) => e.menu_date === date);
          return (
            <section key={date} className="rounded-xl border bg-card p-4" aria-label={formatDayLong(date, locale)} data-testid={`day-${date}`}>
              <h2 className="mb-2 flex items-center justify-between gap-2 font-bold">
                {formatDayLong(date, locale)}
                {date in closed && <Badge variant="destructive">{t("closed")}</Badge>}
              </h2>
              {dayEntries.length === 0 && <p className="mb-2 text-sm text-muted-foreground">{t("emptyDay")}</p>}
              <ul className="mb-3 space-y-2">
                {dayEntries.map((e) => (
                  <li key={e.meal_id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block truncate font-medium">{mealName(e.meal_id)}</span>
                      {e.portions_reserved > 0 && <span className="text-xs text-muted-foreground">{t("reserved", { count: e.portions_reserved })}</span>}
                    </span>
                    <LimitInput
                      key={`${e.meal_id}-${e.portion_limit}`}
                      value={e.portion_limit}
                      label={`${t("limit")} ${mealName(e.meal_id)}`}
                      onSave={(v) => startTransition(async () => report(await setMenuItem(date, e.meal_id, v), t("saved")))}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9 text-destructive"
                      aria-label={`${t("remove")}: ${mealName(e.meal_id)}`}
                      disabled={pending}
                      onClick={() => startTransition(async () => report(await removeMenuItem(date, e.meal_id)))}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
              <AddMeal
                meals={meals.filter((m) => !dayEntries.some((e) => e.meal_id === m.id))}
                disabled={pending}
                onAdd={(mealId, limit) => startTransition(async () => report(await setMenuItem(date, mealId, limit), t("saved")))}
              />
            </section>
          );
        })}
      </div>
    </div>
  );
}

function LimitInput({ value, label, onSave }: { value: number | null; label: string; onSave: (v: string) => void }) {
  const t = useTranslations("admin.menu");
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  return (
    <Input
      type="number"
      min={0}
      inputMode="numeric"
      className="h-9 w-20 text-right"
      value={draft}
      placeholder="∞"
      aria-label={label}
      title={t("limitHint")}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== (value === null ? "" : String(value))) onSave(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function AddMeal({ meals, disabled, onAdd }: { meals: Meal[]; disabled: boolean; onAdd: (mealId: string, limit: string) => void }) {
  const t = useTranslations("admin.menu");
  const locale = useLocale();
  const [mealId, setMealId] = useState("");
  const [limit, setLimit] = useState("15");
  if (!meals.length) return null;
  return (
    <div className="flex items-center gap-2">
      <Select className="h-9 flex-1" value={mealId} onChange={(e) => setMealId(e.target.value)} aria-label={t("addMeal")}>
        <option value="">{t("choose")}</option>
        {meals.map((m) => (
          <option key={m.id} value={m.id}>
            {locale === "en" ? m.name_en : m.name_de}
          </option>
        ))}
      </Select>
      <Input type="number" min={0} className="h-9 w-20 text-right" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="∞" aria-label={t("limit")} />
      <Button
        size="icon"
        className="size-9"
        disabled={disabled || !mealId}
        aria-label={t("addMeal")}
        onClick={() => {
          onAdd(mealId, limit);
          setMealId("");
        }}
      >
        <Plus aria-hidden />
      </Button>
    </div>
  );
}
