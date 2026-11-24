import "@/styles/globals.css";
import type { AppProps } from "next/app";
import SiteHeader from "@/components/SiteHeader";

function MyApp({ Component, pageProps, router }: AppProps) {
  // the 404 page belongs to the new static site and brings its own layout
  const bare = router.pathname === "/404";
  return (
    <>
      {!bare && <SiteHeader />}
      <Component {...pageProps} />
    </>
  );
}

export default MyApp
