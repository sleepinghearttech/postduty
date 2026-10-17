/** Internal receipt evidence. The page renders only storefront/test/verified state. */
type OrderRecord = {
  id: string;
  status: string;
  storefront: 'general' | 'christmas' | null;
  is_test: boolean | null;
  total_amount: number;
  checkout_intent_id: string | null;
};
type PaymentEvidence = {
  order_id: string;
  intent_id: string;
  amount: number;
  currency: string;
  status: string;
  is_test: boolean;
  provider_verified_at: string;
};

export function validOrderReference(value: unknown): value is string {
  return typeof value === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}

export function orderConfirmation(value: unknown, evidence: unknown, sandbox: boolean) {
  if (!value || typeof value !== 'object') return null;
  const order = value as Partial<OrderRecord>;
  if (!validOrderReference(order.id) || typeof order.status !== 'string' ||
      (order.storefront != null && order.storefront !== 'general' && order.storefront !== 'christmas')) return null;
  const payment = evidence && typeof evidence === 'object' ? evidence as Partial<PaymentEvidence> : null;
  const verified = !!payment && ['paid', 'shipped', 'delivered'].includes(order.status) &&
    typeof order.is_test === 'boolean' && (!sandbox || order.is_test) &&
    Number.isSafeInteger(order.total_amount) && (order.total_amount ?? 0) >= 100 &&
    validOrderReference(order.checkout_intent_id) && payment.order_id === order.id &&
    payment.intent_id === order.checkout_intent_id && payment.amount === order.total_amount &&
    payment.currency === 'INR' && payment.status === 'captured' && payment.is_test === order.is_test &&
    typeof payment.provider_verified_at === 'string' && Number.isFinite(Date.parse(payment.provider_verified_at));
  return { storefront: order.storefront ?? 'general', testMode: sandbox || order.is_test === true, verified };
}
