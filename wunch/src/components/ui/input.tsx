import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-base shadow-xs transition-colors placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm",
        className,
      )}
      {...props}
    />
  );
}
