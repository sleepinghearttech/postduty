"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useCart } from "@/components/CartContext";

export default function Header() {
  return <Suspense fallback={<HeaderView christmas={false} />}><ContextHeader /></Suspense>;
}

function ContextHeader() {
  const path = usePathname();
  const searchParams = useSearchParams();
  const [christmasHost, setChristmasHost] = useState(false);
  useEffect(() => { queueMicrotask(() => setChristmasHost(location.hostname === "christmas.postduty.in")); }, []);
  const christmas = christmasHost || path.startsWith("/christmas") || searchParams.get("storefront") === "christmas";
  return <HeaderView christmas={christmas} />;
}

function HeaderView({ christmas }: { christmas: boolean }) {
  const { cart } = useCart();
  const totalItems=cart.filter(i=>i.storefront===(christmas?"christmas":"general")).reduce((n,i)=>n+i.quantity,0);

  return (
    <header className="bg-white border-b border-warm-border sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link
          href={christmas?"/christmas":"/store"}
          className={`font-serif text-lg sm:text-2xl tracking-tight ${christmas?"text-[#7c0f22]":"text-brand"}`}
        >
          {christmas?"Christmas by PostDuty":"PostDuty"}
        </Link>

        <div className="flex items-center gap-3 sm:gap-6">
          <Link
            href="/orders"
            className="text-xs font-semibold text-stone-500 hover:text-brand tracking-wider uppercase transition-colors"
          >
            Track Order
          </Link>
          
          <Link
            href={christmas?"/cart?storefront=christmas":"/cart"}
            className="relative p-1.5 text-stone-600 hover:text-brand transition-colors"
            aria-label="Shopping Cart"
          >
            <svg
              className="w-5.5 h-5.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
              />
            </svg>
            {totalItems > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white shadow-sm animate-pulse">
                {totalItems}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
