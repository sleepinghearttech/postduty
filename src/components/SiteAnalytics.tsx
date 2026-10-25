"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { captureAttribution, trackEvent } from "@/lib/attribution-client";

/** Records one page view per route change on public pages. Owner and creator pages are never tracked. */
export default function SiteAnalytics() {
  const pathname = usePathname();
  const captured = useRef(false);
  useEffect(() => {
    if (!pathname || /^\/(admin|creator|api|my-orders|order\/|orders\/)/.test(pathname)) return;
    if (!captured.current) { captureAttribution(); captured.current = true; }
    trackEvent(pathname.startsWith("/products/") ? "product_view" : "page_view");
  }, [pathname]);
  return null;
}
