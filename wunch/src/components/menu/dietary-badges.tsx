import { Flame, Leaf, Sprout } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { DietaryTag } from "@/lib/i18n-keys";

export function DietaryBadges({ tags, className }: { tags: string[]; className?: string }) {
  const t = useTranslations("dietary");
  if (!tags.length) return null;
  return (
    <ul className={className ?? "flex flex-wrap gap-1.5"} aria-label="Tags">
      {tags.map((tag) => (
        <li key={tag}>
          <Badge variant={tag === "spicy" ? "warning" : "green"}>
            {tag === "vegan" && <Sprout className="size-3" aria-hidden />}
            {tag === "vegetarian" && <Leaf className="size-3" aria-hidden />}
            {tag === "spicy" && <Flame className="size-3" aria-hidden />}
            {t(tag as DietaryTag)}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
