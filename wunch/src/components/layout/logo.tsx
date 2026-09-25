import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/** Placeholder wordmark. The tagline stays with the name, so nobody writes "wunsch". */
export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("inline-flex flex-col items-start leading-none", className)} aria-label="wunch, work + lunch">
      <span className="font-heading text-[1.75rem] font-extrabold tracking-tight text-primary">wunch</span>
      <span className="mt-0.5 pl-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        work + lunch
      </span>
    </Link>
  );
}
