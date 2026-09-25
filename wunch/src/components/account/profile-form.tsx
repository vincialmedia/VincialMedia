"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { updateProfile } from "@/lib/actions/account";
import type { Tables } from "@/lib/supabase/database.types";

export function ProfileForm({ profile }: { profile: Tables<"profiles"> }) {
  const t = useTranslations("checkout");
  const ta = useTranslations("account");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const [pending, startTransition] = useTransition();
  const [invalid, setInvalid] = useState<string[]>([]);

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateProfile(formData);
      if (result.ok) {
        setInvalid([]);
        toast.success(tc("saved"));
      } else {
        setInvalid(result.fields ?? []);
        toast.error(te(result.error === "invalid_input" ? "invalid_input" : "generic"));
      }
    });
  }

  const field = (name: string, label: string, value: string | null, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={value ?? ""} aria-invalid={invalid.includes(name) || undefined} {...props} />
    </div>
  );

  return (
    <form action={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">{field("fullName", t("fullName"), profile.full_name, { autoComplete: "name" })}</div>
      <div className="sm:col-span-2">{field("company", `${t("company")} (${tc("optional")})`, profile.company, { autoComplete: "organization" })}</div>
      <div className="sm:col-span-2">{field("street", t("street"), profile.street, { autoComplete: "street-address" })}</div>
      {field("postcode", t("postcode"), profile.postcode, { autoComplete: "postal-code", inputMode: "numeric", maxLength: 4 })}
      {field("city", t("city"), profile.city, { autoComplete: "address-level2" })}
      {field("floorRoom", `${t("floorRoom")} (${tc("optional")})`, profile.floor_room)}
      {field("phone", t("phone"), profile.phone, { autoComplete: "tel", type: "tel", inputMode: "tel" })}
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="deliveryNote">{`${t("note")} (${tc("optional")})`}</Label>
        <Textarea id="deliveryNote" name="deliveryNote" defaultValue={profile.delivery_note ?? ""} placeholder={t("notePlaceholder")} maxLength={500} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="locale">{ta("language")}</Label>
        <Select id="locale" name="locale" defaultValue={profile.locale}>
          <option value="de">Deutsch</option>
          <option value="en">English</option>
        </Select>
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {tc("save")}
        </Button>
      </div>
    </form>
  );
}
