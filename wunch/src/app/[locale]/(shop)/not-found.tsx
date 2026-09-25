import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="mb-2 text-3xl font-extrabold">{t("title")}</h1>
      <p className="mb-6 text-muted-foreground">{t("body")}</p>
      <Button asChild>
        <Link href="/">{t("cta")}</Link>
      </Button>
    </div>
  );
}
