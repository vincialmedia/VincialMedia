import { UtensilsCrossed } from "lucide-react";
import { mealImageSrcSet, mealImageUrl } from "@/lib/images";
import { cn } from "@/lib/utils";

/**
 * Meal photos are resized to 800w/1600w WebP on upload and served straight
 * from Supabase Storage's CDN, so a plain responsive <img> is the fastest option.
 */
export function MealImage({
  path,
  alt,
  sizes = "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw",
  priority = false,
  className,
  placeholderLabel,
}: {
  path: string | null;
  alt: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
  placeholderLabel?: string;
}) {
  if (!path) {
    return (
      <div className={cn("flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 bg-secondary text-muted-foreground", className)}>
        <UtensilsCrossed className="size-8" aria-hidden />
        {placeholderLabel && <span className="text-xs">{placeholderLabel}</span>}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- pre-sized CDN variants, see comment above
    <img
      src={mealImageUrl(path, 800)!}
      srcSet={mealImageSrcSet(path)}
      sizes={sizes}
      alt={alt}
      width={800}
      height={600}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      className={cn("aspect-[4/3] w-full bg-secondary object-cover", className)}
    />
  );
}
