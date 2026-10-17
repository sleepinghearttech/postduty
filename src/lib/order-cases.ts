/** Manual service records only. No payment, inventory or order status effects. */
export type OrderCaseKind = 'cancellation' | 'return' | 'refund';
export type OrderCaseStatus = 'requested' | 'approved' | 'rejected' | 'resolved';
export type OrderCase = {
  id: string; order_id: string; kind: OrderCaseKind; status: OrderCaseStatus;
  reason: string; note: string; requested_amount_paise: number; decision_note: string;
  external_reference: string | null; created_at: string; updated_at: string;
  approved_at: string | null; rejected_at: string | null; resolved_at: string | null;
};
export class OrderCaseError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const orderCaseLabels: Record<OrderCaseKind, string> = { cancellation: 'Cancellation', return: 'Return', refund: 'Refund' };
export const orderCaseTransitions: Record<OrderCaseStatus, readonly OrderCaseStatus[]> = {
  requested: ['approved', 'rejected'], approved: ['resolved'], rejected: ['resolved'], resolved: [],
};
export function requireCaseUuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new OrderCaseError('A valid case and order reference is required.');
  return value;
}
function text(value: unknown, label: string, max: number, required = false): string {
  if (value == null && !required) return '';
  if (typeof value !== 'string') throw new OrderCaseError(`${label} must be text.`);
  const trimmed = value.trim();
  if (trimmed.length > max || (required && !trimmed)) throw new OrderCaseError(`${label} is required and must be ${max} characters or fewer.`);
  return trimmed;
}
export type CreateCaseCommand = { action: 'create'; id: string; order_id: string; kind: OrderCaseKind; reason: string; note: string; requested_amount_paise: number };
export type TransitionCaseCommand = { action: 'transition'; id: string; next_status: Exclude<OrderCaseStatus, 'requested'>; note: string; external_reference: string; expected_updated_at: string };
export function parseOrderCaseCommand(input: unknown): CreateCaseCommand | TransitionCaseCommand {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new OrderCaseError('Enter a valid service request.');
  const body = input as Record<string, unknown>;
  const id = requireCaseUuid(body.id);
  if (body.action === 'create') {
    if (!['cancellation', 'return', 'refund'].includes(String(body.kind))) throw new OrderCaseError('Choose cancellation, return or refund.');
    const amount = body.amount_rupees ?? 0;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > 21474836.47 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001) throw new OrderCaseError('Requested amount must be a non-negative rupee amount with at most two decimal places.');
    const requested_amount_paise = Math.round(amount * 100);
    if (body.kind === 'refund' && requested_amount_paise === 0) throw new OrderCaseError('A refund request needs an amount greater than zero.');
    return { action: 'create', id, order_id: requireCaseUuid(body.order_id), kind: body.kind as OrderCaseKind, reason: text(body.reason, 'Reason', 2000, true), note: text(body.note, 'Private note', 4000), requested_amount_paise };
  }
  if (body.action === 'transition') {
    if (!['approved', 'rejected', 'resolved'].includes(String(body.next_status))) throw new OrderCaseError('Choose a valid case decision.');
    const expected_updated_at = text(body.expected_updated_at, 'Case version', 80, true);
    if (!Number.isFinite(Date.parse(expected_updated_at))) throw new OrderCaseError('Reload the case before changing its status.', 409);
    return { action: 'transition', id, next_status: body.next_status as TransitionCaseCommand['next_status'], note: text(body.note, 'Decision note', 4000, body.next_status === 'rejected'), external_reference: text(body.external_reference, 'External resolution reference', 250, body.next_status === 'resolved'), expected_updated_at };
  }
  throw new OrderCaseError('Choose a valid service request action.');
}
export function assertCaseAmount(command: Pick<CreateCaseCommand, 'requested_amount_paise'>, orderTotal: number): void {
  if (!Number.isSafeInteger(orderTotal) || orderTotal < 0 || command.requested_amount_paise > orderTotal) throw new OrderCaseError('The requested amount cannot exceed the order total.');
}
export function assertCaseTransition(current: Pick<OrderCase, 'status' | 'updated_at'>, command: TransitionCaseCommand): void {
  if (Date.parse(current.updated_at) !== Date.parse(command.expected_updated_at)) throw new OrderCaseError('This case changed. Refresh cases before making another decision.', 409);
  if (!orderCaseTransitions[current.status]?.includes(command.next_status)) throw new OrderCaseError('This case transition is not allowed. Refresh cases to see the current status.', 409);
}
