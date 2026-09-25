"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export function NewPasswordForm() {
  const t = useTranslations("auth");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "busy" | "done" | "error">("idle");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("busy");
    const { error } = await createClient().auth.updateUser({ password });
    setStatus(error ? "error" : "done");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="new-password">{t("newPassword")}</Label>
        <Input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
        <p className="text-xs text-muted-foreground">{t("passwordHint")}</p>
      </div>
      {status === "done" && <p role="status" className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{t("passwordSaved")}</p>}
      {status === "error" && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{t("errors.weak_password")}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={status === "busy" || password.length < 8}>
        {t("setPassword")}
      </Button>
    </form>
  );
}
