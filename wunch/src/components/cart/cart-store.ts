"use client";

// Cart state in localStorage, shared across tabs, safe for server rendering.
import { useSyncExternalStore } from "react";

export type CartLine = {
  mealId: string;
  quantity: number;
  nameDe: string;
  nameEn: string;
  priceRappen: number;
  imagePath: string | null;
};

export type Cart = { date: string | null; lines: CartLine[] };

const KEY = "wunch.cart.v1";
const EMPTY: Cart = { date: null, lines: [] };
export const MAX_QUANTITY = 20;

let current: Cart = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function read(): Cart {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Cart;
    if (!parsed || !Array.isArray(parsed.lines)) return EMPTY;
    return {
      date: typeof parsed.date === "string" ? parsed.date : null,
      lines: parsed.lines.filter((l) => l && typeof l.mealId === "string" && l.quantity > 0),
    };
  } catch {
    return EMPTY;
  }
}

function ensureLoaded() {
  if (!loaded && typeof window !== "undefined") {
    current = read();
    loaded = true;
    window.addEventListener("storage", (e) => {
      if (e.key === KEY) {
        current = read();
        listeners.forEach((l) => l());
      }
    });
  }
}

function write(next: Cart) {
  current = next.lines.length ? next : EMPTY;
  try {
    if (current.lines.length) window.localStorage.setItem(KEY, JSON.stringify(current));
    else window.localStorage.removeItem(KEY);
  } catch {
    // private mode: keep in memory only
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  ensureLoaded();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  ensureLoaded();
  return current;
}

function getServerSnapshot() {
  return EMPTY;
}

export function useCart(): Cart {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Has the cart been read from storage yet? (false during SSR/first paint) */
export function useCartHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

export const cartActions = {
  add(date: string, line: Omit<CartLine, "quantity">, quantity = 1) {
    const base = current.date === date ? current : { date, lines: [] };
    const existing = base.lines.find((l) => l.mealId === line.mealId);
    const lines = existing
      ? base.lines.map((l) =>
          l.mealId === line.mealId ? { ...l, ...line, quantity: Math.min(MAX_QUANTITY, l.quantity + quantity) } : l,
        )
      : [...base.lines, { ...line, quantity: Math.min(MAX_QUANTITY, quantity) }];
    write({ date, lines });
  },
  setQuantity(mealId: string, quantity: number) {
    const q = Math.max(0, Math.min(MAX_QUANTITY, Math.floor(quantity)));
    write({
      ...current,
      lines: q === 0 ? current.lines.filter((l) => l.mealId !== mealId) : current.lines.map((l) => (l.mealId === mealId ? { ...l, quantity: q } : l)),
    });
  },
  remove(mealId: string) {
    write({ ...current, lines: current.lines.filter((l) => l.mealId !== mealId) });
  },
  setDate(date: string) {
    write({ ...current, date });
  },
  replace(cart: Cart) {
    write(cart);
  },
  clear() {
    write(EMPTY);
  },
};

export function cartCount(cart: Cart): number {
  return cart.lines.reduce((n, l) => n + l.quantity, 0);
}

export function cartSubtotal(cart: Cart): number {
  return cart.lines.reduce((n, l) => n + l.quantity * l.priceRappen, 0);
}
