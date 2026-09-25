import * as React from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="relative w-full overflow-x-auto rounded-xl border bg-card">
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}
export function THead(props: React.ComponentProps<"thead">) {
  return <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground" {...props} />;
}
export function TBody(props: React.ComponentProps<"tbody">) {
  return <tbody className="divide-y divide-border" {...props} />;
}
export function TR({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn("hover:bg-muted/30", className)} {...props} />;
}
export function TH({ className, ...props }: React.ComponentProps<"th">) {
  return <th className={cn("px-3 py-2.5 font-semibold whitespace-nowrap", className)} {...props} />;
}
export function TD({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("px-3 py-2.5 align-top", className)} {...props} />;
}
