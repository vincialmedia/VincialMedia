import * as React from "react";
import { cn } from "@/lib/utils";

// Native select: best on phones, accessible by default.
export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "h-11 w-full rounded-lg border border-input bg-card px-3 text-base shadow-xs disabled:opacity-50 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}
