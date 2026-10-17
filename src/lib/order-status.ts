import type { OrderStatus } from './types';

export class OrderUpdateError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

/**
 * Owner-controlled order lifecycle. `pending` → `paid` happens only inside verified payment finalization.
 * Recording `refunded` never moves money: the refund itself is made in the payment provider dashboard.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: [],
  paid: ['shipped', 'cancelled', 'refunded'],
  shipped: ['delivered', 'refunded'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
};
export const ORDER_STATUSES = Object.keys(ORDER_TRANSITIONS) as OrderStatus[];
export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ORDER_TRANSITIONS, value);
}
export function canTransition(from: string, to: string): boolean {
  return isOrderStatus(from) && isOrderStatus(to) && ORDER_TRANSITIONS[from].includes(to);
}

const hasText = (value: unknown) => typeof value === 'string' && value.trim().length > 0;

export const CLAWBACK_REQUIRED = 'A creator settlement already includes items from this order. Settled lines are frozen: arrange a clawback with the creator first. Nothing was changed.';

export type OrderUpdatePlan =
  | { kind: 'cancel' }
  /** Refund recorded in one transaction; restocks (and returns the coupon use) only when not yet shipped. */
  | { kind: 'refund'; restock: boolean }
  | { kind: 'update'; updates: Record<string, unknown>; notifyShipped: boolean; firstTracking: boolean };

/**
 * Pure planning for /api/admin/update-order. The shipped notification is sent exactly once:
 * when a tracking number is first saved on a shipped order (marking shipped alone sends nothing).
 */
export function planOrderUpdate(current: { status: string; tracking_number: string | null }, body: unknown, now = new Date(), settledLines = false): OrderUpdatePlan {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new OrderUpdateError('Invalid request.');
  const input = body as Record<string, unknown>;
  if (input.status !== undefined && !isOrderStatus(input.status)) throw new OrderUpdateError('Unknown order status.');
  const nextStatus = input.status as OrderStatus | undefined;
  let tracking: string | undefined;
  if (input.tracking_number !== undefined) {
    if (typeof input.tracking_number !== 'string' || !input.tracking_number.trim() || input.tracking_number.trim().length > 100 || /[<>\x00-\x1F]/.test(input.tracking_number)) throw new OrderUpdateError('Enter a tracking number of up to 100 characters.');
    tracking = input.tracking_number.trim();
  }
  if (nextStatus !== undefined && nextStatus !== current.status && !canTransition(current.status, nextStatus)) {
    throw new OrderUpdateError(`Invalid status transition: ${current.status} → ${nextStatus}`);
  }
  const changesStatus = nextStatus !== undefined && nextStatus !== current.status;
  if (changesStatus && nextStatus === 'cancelled') {
    if (tracking !== undefined) throw new OrderUpdateError('A cancelled order cannot have tracking.');
    if (settledLines) throw new OrderUpdateError(CLAWBACK_REQUIRED, 409);
    return { kind: 'cancel' };
  }
  if (changesStatus && nextStatus === 'refunded') {
    if (tracking !== undefined) throw new OrderUpdateError('Save tracking separately from a refund.');
    if (settledLines) throw new OrderUpdateError(CLAWBACK_REQUIRED, 409);
    return { kind: 'refund', restock: current.status === 'paid' };
  }
  const finalStatus = changesStatus ? nextStatus : current.status;
  if (tracking !== undefined && !['shipped', 'delivered'].includes(finalStatus)) throw new OrderUpdateError('Tracking can be saved once the order is shipped.');
  const updates: Record<string, unknown> = {};
  if (changesStatus) {
    updates.status = nextStatus;
    if (nextStatus === 'delivered') updates.delivered_at = now.toISOString();
  }
  if (tracking !== undefined && tracking !== current.tracking_number) updates.tracking_number = tracking;
  if (!Object.keys(updates).length) throw new OrderUpdateError('Nothing to update');
  const firstTracking = updates.tracking_number !== undefined && !hasText(current.tracking_number);
  return { kind: 'update', updates, firstTracking, notifyShipped: firstTracking && finalStatus === 'shipped' };
}

export function personalizationText(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (value && typeof value === 'object' && typeof (value as { text?: unknown }).text === 'string') return ((value as { text: string }).text).trim() || null;
  return null;
}

/** "Name (Option) × 2 — Personalisation: text" for owner views and alerts. */
export function describeOrderLine(line: { product_name?: string | null; products?: { name: string } | null; quantity: number; variant_id?: string | null; variant_name?: string | null; personalization?: unknown }): string {
  const name = line.product_name?.trim() || line.products?.name || 'Product';
  const option = line.variant_name?.trim() || line.variant_id?.trim();
  const text = personalizationText(line.personalization);
  return `${name}${option ? ` (${option})` : ''} × ${line.quantity}${text ? ` — Personalisation: ${text}` : ''}`;
}
