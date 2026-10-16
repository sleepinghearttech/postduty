"use client";

import { usePathname } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

/**
 * The creative homepage has its own full-bleed visual identity.
 * All existing commerce, admin and order routes retain their existing
 * navigation and footer; no checkout, payment or order logic changes.
 */
export default function SiteShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();

  if (pathname === "/" || pathname.startsWith("/admin") || pathname.startsWith("/creator")) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-warm-bg">
      <Header />
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  );
}
