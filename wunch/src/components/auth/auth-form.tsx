"use client";

import { Loader2, Mail } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { afterSignIn } from "@/lib/actions/auth";
import type { AuthErrorKey } from "@/lib/i18n-keys";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup" | "reset";

const KNOWN_ERRORS: AuthErrorKey[] = [
  "invalid_credentials",
  "user_already_exists",
  "email_exists",
  "weak_password",
  "over_request_rate_limit",
  "over_email_send_rate_limit",
  "email_not_confirmed",
  "email_address_invalid",
];

export function AuthForm({
  next = "/",
  initialMode = "login",
  onSignedIn,
}: {
  next?: string;
  initialMode?: Mode;
  /** Full path including the locale prefix, e.g. "/en/orders". */
  /** When set (inline checkout), called instead of navigating away. */
  onSignedIn?: () => void;
}) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"password" | "magic" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const supabase = createClient();
  const redirectTo = (path: string) =>
    `${window.location.origin}/auth/confirm?next=${encodeURIComponent(path)}`;

  function showError(code: string | undefined) {
    setError(t(`errors.${(code && KNOWN_ERRORS.includes(code as AuthErrorKey) ? code : "generic") as AuthErrorKey}`));
  }

  async function finish() {
    await afterSignIn();
    if (onSignedIn) {
      onSignedIn();
      router.refresh();
    } else {
      router.replace(next);
      router.refresh();
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy("password");
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return showError(error.code);
        await finish();
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo(next), data: { locale } },
        });
        if (error) return showError(error.code);
        if (data.session) await finish();
        else setNotice(t("magicLinkSent", { email }));
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectTo(next) });
        if (error) return showError(error.code);
        setNotice(t("resetSent", { email }));
      }
    } finally {
      setBusy(null);
    }
  }

  async function sendMagicLink() {
    setError(null);
    setNotice(null);
    if (!email) {
      setError(t("errors.email_address_invalid"));
      return;
    }
    setBusy("magic");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo(next), data: { locale }, shouldCreateUser: true },
      });
      if (error) return showError(error.code);
      setNotice(t("magicLinkSent", { email }));
    } finally {
      setBusy(null);
    }
  }

  const title = mode === "login" ? t("loginTitle") : mode === "signup" ? t("signupTitle") : t("resetTitle");

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">{title}</h2>
      <form onSubmit={onSubmit} className="space-y-3" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="auth-email">{t("email")}</Label>
          <Input
            id="auth-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value.trim())}
          />
        </div>
        {mode !== "reset" && (
          <div className="space-y-1.5">
            <Label htmlFor="auth-password">{t("password")}</Label>
            <Input
              id="auth-password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby={mode === "signup" ? "auth-password-hint" : undefined}
            />
            {mode === "signup" && (
              <p id="auth-password-hint" className="text-xs text-muted-foreground">
                {t("passwordHint")}
              </p>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
            {notice}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={busy !== null}>
          {busy === "password" && <Loader2 className="animate-spin" aria-hidden />}
          {mode === "login" ? t("login") : mode === "signup" ? t("signup") : t("resetSend")}
        </Button>
      </form>

      {mode !== "reset" && (
        <>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {t("or")}
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button type="button" variant="outline" size="lg" className="w-full" onClick={sendMagicLink} disabled={busy !== null}>
            {busy === "magic" ? <Loader2 className="animate-spin" aria-hidden /> : <Mail aria-hidden />}
            {t("magicLink")}
          </Button>
        </>
      )}

      <div className="space-y-1 text-center text-sm">
        {mode === "login" && (
          <>
            <p>
              {t("noAccount")}{" "}
              <button type="button" className="font-semibold text-primary underline-offset-4 hover:underline" onClick={() => setMode("signup")}>
                {t("toSignup")}
              </button>
            </p>
            <p>
              <button type="button" className="text-muted-foreground underline-offset-4 hover:underline" onClick={() => setMode("reset")}>
                {t("forgot")}
              </button>
            </p>
          </>
        )}
        {mode !== "login" && (
          <p>
            {t("haveAccount")}{" "}
            <button type="button" className="font-semibold text-primary underline-offset-4 hover:underline" onClick={() => setMode("login")}>
              {t("toLogin")}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
