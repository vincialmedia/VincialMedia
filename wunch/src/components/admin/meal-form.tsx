"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MealImageClient } from "@/components/menu/meal-image-client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { deleteMeal, restoreMeal, saveMeal } from "@/lib/actions/admin-meals";
import { ALLERGENS, CATEGORIES, DIETARY_TAGS } from "@/lib/i18n-keys";
import { rappenToInput } from "@/lib/money";
import type { Tables } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

export function MealForm({ meal }: { meal: Tables<"meals"> | null }) {
  const t = useTranslations("admin.meals");
  const tc = useTranslations("admin.common");
  const tm = useTranslations("menu.categories");
  const td = useTranslations("dietary");
  const ta = useTranslations("allergens");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [invalid, setInvalid] = useState<string[]>([]);
  const [always, setAlways] = useState(meal?.always_available ?? false);
  const [preview, setPreview] = useState<string | null>(null);

  function submit(formData: FormData) {
    if (meal) formData.set("id", meal.id);
    startTransition(async () => {
      const result = await saveMeal(formData);
      if (result.ok) {
        toast.success(t("saved"));
        setInvalid([]);
        router.push("/admin/meals");
      } else {
        setInvalid(result.fields ?? []);
        toast.error(result.error === "photo_invalid" || result.error === "photo_too_big" ? t("photoError") : result.fields?.includes("price") ? t("priceInvalid") : result.error === "invalid" ? tc("invalid") : tc("error", { message: result.error }));
      }
    });
  }

  function remove() {
    if (!meal || !confirm(t("confirmDelete", { name: locale === "en" ? meal.name_en : meal.name_de }))) return;
    startTransition(async () => {
      const result = await deleteMeal(meal.id);
      if (result.ok) {
        toast.success(result.archived ? t("archived") : t("deleted"));
        router.push("/admin/meals");
      } else toast.error(tc("error", { message: result.error }));
    });
  }

  const bad = (f: string) => invalid.includes(f) || undefined;

  return (
    <form action={submit} className="space-y-6">
      <section className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 sm:p-5">
        <div className="space-y-1.5">
          <Label htmlFor="nameDe">{t("nameDe")}</Label>
          <Input id="nameDe" name="nameDe" defaultValue={meal?.name_de} required maxLength={120} aria-invalid={bad("nameDe")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nameEn">{t("nameEn")}</Label>
          <Input id="nameEn" name="nameEn" defaultValue={meal?.name_en} required maxLength={120} aria-invalid={bad("nameEn")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="descriptionDe">{t("descriptionDe")}</Label>
          <Textarea id="descriptionDe" name="descriptionDe" defaultValue={meal?.description_de} rows={4} maxLength={2000} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="descriptionEn">{t("descriptionEn")}</Label>
          <Textarea id="descriptionEn" name="descriptionEn" defaultValue={meal?.description_en} rows={4} maxLength={2000} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="price">{t("price")}</Label>
          <Input id="price" name="price" inputMode="decimal" defaultValue={meal ? rappenToInput(meal.price_rappen) : ""} placeholder="16.50" required aria-invalid={bad("price")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="category">{t("category")}</Label>
          <Select id="category" name="category" defaultValue={meal?.category ?? "main"}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {tm(c)}
              </option>
            ))}
          </Select>
        </div>
      </section>

      <section className="grid gap-5 rounded-xl border bg-card p-4 sm:grid-cols-2 sm:p-5">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{t("dietary")}</legend>
          <div className="grid gap-2">
            {DIETARY_TAGS.map((d) => (
              <label key={d} className="flex items-center gap-2 text-sm">
                <Checkbox name="dietary" value={d} defaultChecked={meal?.dietary_tags.includes(d)} />
                {td(d)}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{t("allergens")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {ALLERGENS.map((a) => (
              <label key={a} className="flex items-center gap-2 text-sm">
                <Checkbox name="allergens" value={a} defaultChecked={meal?.allergens.includes(a)} />
                {ta(a)}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-[200px_1fr] sm:p-5">
        <div className="overflow-hidden rounded-lg">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local preview of the chosen file
            <img src={preview} alt="" className="aspect-[4/3] w-full object-cover" />
          ) : (
            <MealImageClient path={meal?.image_path ?? null} alt={t("photoCurrent")} />
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="photo">{t("photo")}</Label>
          <Input
            id="photo"
            name="photo"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif"
            className="h-auto py-2"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setPreview(f ? URL.createObjectURL(f) : null);
            }}
          />
          <p className="text-xs text-muted-foreground">{t("photoHint")}</p>
          {meal?.image_path && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="removePhoto" />
              {t("removePhoto")}
            </label>
          )}
        </div>
      </section>

      <section className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 sm:p-5">
        <label className="flex items-center gap-2 text-sm font-medium">
          <Checkbox name="isActive" defaultChecked={meal?.is_active ?? true} />
          {t("active")}
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <Checkbox name="alwaysAvailable" checked={always} onChange={(e) => setAlways(e.target.checked)} />
          {t("always")}
        </label>
        <div className={cn("space-y-1.5", !always && "opacity-50")}>
          <Label htmlFor="dailyLimit">{t("dailyLimit")}</Label>
          <Input id="dailyLimit" name="dailyLimit" type="number" min={0} defaultValue={meal?.daily_portion_limit ?? ""} disabled={!always} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sortOrder">{t("sortOrder")}</Label>
          <Input id="sortOrder" name="sortOrder" type="number" defaultValue={meal?.sort_order ?? 0} />
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {tc("save")}
        </Button>
        {meal && !meal.archived_at && (
          <Button type="button" variant="ghost" onClick={remove} disabled={pending} className="text-destructive">
            <Trash2 aria-hidden />
            {tc("delete")}
          </Button>
        )}
        {meal?.archived_at && (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await restoreMeal(meal.id);
                if (r.ok) toast.success(t("restored"));
                router.refresh();
              })
            }
          >
            {t("restore")}
          </Button>
        )}
      </div>
    </form>
  );
}
