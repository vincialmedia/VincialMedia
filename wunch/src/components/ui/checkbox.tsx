import * as React from "react";
import { cn } from "@/lib/utils";

export function Checkbox({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn("size-5 shrink-0 rounded border-input accent-[var(--primary)]", className)}
      {...props}
    />
  );
}
