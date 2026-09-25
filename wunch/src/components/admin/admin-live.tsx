"use client";

import { Bell, BellRing, Radio } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Live Today view: refreshes on every order change (Supabase Realtime; RLS
 * lets admins see all orders), chimes for new orders once sound is enabled
 * (browsers need one click first) and keeps the phone screen awake.
 */
export function AdminLive({ newOrderIds }: { newOrderIds: string[] }) {
  const t = useTranslations("admin.today");
  const router = useRouter();
  const [soundOn, setSoundOn] = useState(false);
  const [connected, setConnected] = useState(true);
  const audio = useRef<AudioContext | null>(null);
  const known = useRef<Set<string> | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Chime when an order id shows up in "new" that we haven't seen before
  useEffect(() => {
    if (known.current === null) {
      known.current = new Set(newOrderIds);
      return;
    }
    const fresh = newOrderIds.filter((id) => !known.current!.has(id));
    newOrderIds.forEach((id) => known.current!.add(id));
    if (fresh.length) {
      toast.info(t("newAlert"));
      if (soundOn && audio.current) chime(audio.current);
      if ("vibrate" in navigator) navigator.vibrate?.([200, 100, 200]);
    }
    document.title = newOrderIds.length ? `(${newOrderIds.length}) wunch admin` : "wunch admin";
  }, [newOrderIds, soundOn, t]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("admin-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => router.refresh(), 300);
      })
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));
    // safety net in case the socket silently drops
    const poll = setInterval(() => router.refresh(), 60_000);
    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [router]);

  async function enableSound() {
    const ctx = audio.current ?? new AudioContext();
    audio.current = ctx;
    await ctx.resume();
    chime(ctx);
    setSoundOn(true);
    try {
      await navigator.wakeLock?.request("screen");
    } catch {
      // wake lock not available: fine
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", connected ? "bg-accent-soft text-accent" : "bg-warning-soft text-warning")} role="status">
        <Radio className={cn("size-3.5", connected && "animate-pulse")} aria-hidden />
        {connected ? t("live") : t("offline")}
      </span>
      <Button variant={soundOn ? "secondary" : "default"} size="sm" onClick={enableSound} aria-pressed={soundOn} title={soundOn ? t("keepAwake") : undefined}>
        {soundOn ? <BellRing aria-hidden /> : <Bell aria-hidden />}
        {soundOn ? t("soundOn") : t("enableSound")}
      </Button>
    </div>
  );
}

/** Two-tone chime generated with Web Audio (no sound file needed). */
function chime(ctx: AudioContext) {
  const now = ctx.currentTime;
  [
    [880, 0],
    [1320, 0.18],
  ].forEach(([freq, offset]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.4, now + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.55);
  });
}
