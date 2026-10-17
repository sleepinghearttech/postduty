import { Suspense } from "react";
import { parseAllowedStates, servedStates, SINGLE_ITEM_SHIPPING_PAISE } from "@/lib/checkout-contract";
import CartClient from "./CartClient";

// Delivery and tax display read runtime configuration on every request.
export const dynamic = "force-dynamic";

export default function CartPage() {
  const allowed = parseAllowedStates(process.env.ALLOWED_SHIPPING_STATES);
  return (
    <Suspense fallback={<main className="p-10 text-center">Loading your bag…</main>}>
      <CartClient
        states={servedStates(allowed).map(state => ({ ...state }))}
        allStatesServed={allowed === null}
        singleItemShipping={SINGLE_ITEM_SHIPPING_PAISE}
        gstRegistered={process.env.GST_REGISTERED === "true"}
      />
    </Suspense>
  );
}
