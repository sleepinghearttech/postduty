"use client";

import { useEffect } from "react";

export default function ReferralBanner({
  referrerCode,
  couponCode,
  discountLabel,
}: {
  referrerCode: string;
  couponCode: string;
  discountLabel: string;
}) {
  // Save referral code to localStorage so it auto-fills at checkout
  useEffect(() => {
    try {
      localStorage.setItem("postduty_referral_code", couponCode);
    } catch { /* ignore */ }
  }, [couponCode]);

  return (
    <div className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white py-4 px-4">
      <div className="max-w-6xl mx-auto flex items-center justify-center gap-3 text-center flex-wrap">
        <span className="text-2xl">🎉</span>
        <div>
          <p className="text-sm sm:text-base font-semibold">
            You&apos;ve been referred! Use code{" "}
            <span className="font-mono bg-white/20 px-2 py-0.5 rounded text-white font-bold">
              {couponCode}
            </span>{" "}
            for <span className="underline decoration-2">{discountLabel}</span> your order
          </p>
          <p className="text-xs text-white/70 mt-1">
            Discount auto-applied at checkout • Referred by {referrerCode}
          </p>
        </div>
      </div>
    </div>
  );
}
