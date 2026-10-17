import { personalizationText } from './order-status';
import type { ShippingDetails } from './types';

export type PackingSlipOrder = {
  id: string; created_at: string; status: string; customer_name: string; customer_phone: string; shipping_address: string;
  is_gift?: boolean | null; gift_message?: string | null; shipping_details?: ShippingDetails | null;
};
export type PackingSlipItem = {
  quantity: number; product_name?: string | null; products?: { name: string } | null;
  variant_id?: string | null; variant_name?: string | null; personalization?: unknown;
};
export type PackingSlip = {
  reference: string; orderId: string; placedAt: string; status: string;
  recipient: string; phone: string; addressLines: string[];
  items: { name: string; option: string | null; quantity: number; personalization: string | null }[];
  totalUnits: number; giftMessage: string | null;
};

/** Packing slips deliberately omit prices, email and payment references. */
export function packingSlipView(order: PackingSlipOrder, items: PackingSlipItem[]): PackingSlip {
  const d = order.shipping_details;
  const structured = d?.address_line1 && d.city && d.state && d.pincode;
  const addressLines = structured
    ? [d.address_line1!, d.address_line2 ?? '', d.city!, `${d.state} - ${d.pincode}`].filter(line => line.trim())
    : order.shipping_address.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  return {
    reference: order.id.slice(0, 8).toUpperCase(), orderId: order.id, placedAt: order.created_at, status: order.status,
    recipient: d?.name?.trim() || order.customer_name, phone: d?.phone?.trim() || order.customer_phone, addressLines,
    items: items.map(item => ({
      name: item.product_name?.trim() || item.products?.name || 'Product',
      option: item.variant_name?.trim() || item.variant_id?.trim() || null,
      quantity: item.quantity,
      personalization: personalizationText(item.personalization),
    })),
    totalUnits: items.reduce((sum, item) => sum + item.quantity, 0),
    giftMessage: order.is_gift ? order.gift_message?.trim() || null : null,
  };
}
