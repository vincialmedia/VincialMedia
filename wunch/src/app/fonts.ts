import { Bricolage_Grotesque, Inter } from "next/font/google";

// Body and heading fonts. Swap these two for the real brand fonts.
export const bodyFont = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
export const headingFont = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
  weight: ["600", "800"],
});
