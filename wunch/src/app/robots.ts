import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://wunch.ch";
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/en/admin", "/checkout", "/en/checkout", "/cart", "/en/cart", "/account", "/en/account", "/orders", "/en/orders", "/api", "/auth"] },
    host: base,
  };
}
