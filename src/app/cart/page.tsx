import { Suspense } from "react";
import { gstRegistered, parseAllowedPinPrefixes, parseAllowedStates, SAME_DAY_SHIPPING_PAISE, servedStates, SINGLE_ITEM_SHIPPING_PAISE } from "@/lib/checkout-contract";
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
        pinPrefixes={parseAllowedPinPrefixes(process.env.ALLOWED_PIN_PREFIXES)}
        deliveryAreaLabel={process.env.DELIVERY_AREA_LABEL?.trim() || null}
        sameDayPrefixes={parseAllowedPinPrefixes(process.env.SAME_DAY_PIN_PREFIXES)}
        sameDayShipping={SAME_DAY_SHIPPING_PAISE}
        singleItemShipping={SINGLE_ITEM_SHIPPING_PAISE}
        gstRegistered={gstRegistered(process.env)}
      />
    </Suspense>
  );
}
