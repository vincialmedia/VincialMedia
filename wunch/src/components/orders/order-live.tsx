"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { cartActions } from "@/components/cart/cart-store";
import { createClient } from "@/lib/supabase/client";

/**
 * Refreshes the page when this order changes (Supabase Realtime, RLS makes
 * sure customers only receive their own orders), with polling as a fallback.
 */
export function OrderLive({ orderId, status, clearCart }: { orderId: string; status: string; clearCart?: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (clearCart) cartActions.clear();
  }, [clearCart]);

  useEffect(() => {
    const waiting = status === "pending_payment" || status === "new";
    if (!waiting) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`order-${orderId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}` }, () => router.refresh())
      .subscribe();
    const poll = setInterval(() => router.refresh(), status === "pending_payment" ? 3000 : 20000);
    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [orderId, status, router]);

  return null;
}
