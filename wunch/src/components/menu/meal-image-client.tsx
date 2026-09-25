"use client";

import { UtensilsCrossed } from "lucide-react";
import { mealImageUrl } from "@/lib/images";
import { cn } from "@/lib/utils";

/** Small thumbnail for client components (cart, checkout). */
export function MealImageClient({ path, alt, className }: { path: string | null; alt: string; className?: string }) {
  if (!path) {
    return (
      <div className={cn("flex aspect-[4/3] w-full items-center justify-center bg-secondary text-muted-foreground", className)}>
        <UtensilsCrossed className="size-5" aria-hidden />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- pre-sized CDN variant
  return <img src={mealImageUrl(path, 800)!} alt={alt} width={800} height={600} loading="lazy" className={cn("aspect-[4/3] w-full object-cover", className)} />;
}
