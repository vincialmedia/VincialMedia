import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const navLinks = [
  { id: "services", label: "Services" },
  { id: "portfolio", label: "Portfolio" },
  { id: "contact", label: "Kontakt" },
];

export default function SiteHeader() {
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isHome = router.pathname === "/";

  const handleNavClick = (sectionId: string) => {
    setMobileMenuOpen(false);
    if (isHome) {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
        return;
      }
    }
    // the homepage is now a static page: map the old section ids to where that content lives
    const target: Record<string, string> = { services: "/#finder", portfolio: "/", contact: "/#finder" };
    window.location.assign(target[sectionId] || "/");
  };

  return (
    <header className="fixed top-0 inset-x-0 z-50 bg-white/75 backdrop-blur-md border-b border-gray-200/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2.5 group" aria-label="Vincialmedia Startseite">
            <div className="relative w-9 h-9 rounded-lg bg-black flex items-center justify-center overflow-hidden group-hover:bg-red-600 transition-colors duration-300">
              <span className="text-white font-black text-lg leading-none tracking-tighter">V</span>
              <span className="absolute bottom-1 right-1.5 w-1 h-1 rounded-full bg-red-500 group-hover:bg-white transition-colors duration-300"></span>
            </div>
            <span className="text-xl font-bold text-black group-hover:text-red-600 transition-colors duration-300">
              Vincialmedia
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <button
                key={link.id}
                onClick={() => handleNavClick(link.id)}
                className="text-sm font-medium text-gray-700 hover:text-red-600 transition-colors duration-300"
              >
                {link.label}
              </button>
            ))}
          </nav>

          <Button
            onClick={() => handleNavClick("services")}
            className="hidden md:inline-flex bg-black text-white hover:bg-red-600 transition-colors"
          >
            Jetzt starten
          </Button>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 -mr-2 text-black hover:text-red-600 transition-colors"
            aria-label={mobileMenuOpen ? "Menü schliessen" : "Menü öffnen"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {mobileMenuOpen && (
          <nav className="md:hidden pb-4 pt-2 border-t border-gray-200/60 flex flex-col gap-1">
            {navLinks.map((link) => (
              <button
                key={link.id}
                onClick={() => handleNavClick(link.id)}
                className="px-3 py-2.5 text-left text-sm font-medium text-gray-700 hover:text-red-600 hover:bg-gray-50 rounded-md transition-colors duration-300"
              >
                {link.label}
              </button>
            ))}
            <Button
              onClick={() => handleNavClick("services")}
              className="bg-black text-white hover:bg-red-600 mt-2"
            >
              Jetzt starten
            </Button>
          </nav>
        )}
      </div>
    </header>
  );
}
