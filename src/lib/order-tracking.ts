export type TrackingOrderRecord = {
  id: string; status: string; tracking_number: string | null; total_amount: number;
  customer_phone: string; created_at: string; is_test?: boolean | null;
};
export type TrackingItemRecord = {
  id: string; quantity: number; unit_price: number; product_name?: string | null;
  fulfillment_status?: string | null; tracking_number?: string | null; courier?: string | null;
  tracking_url?: string | null; creator_id?: string | null;
  products?: { name: string } | null;
};
export type CustomerOrderTracking = {
  status: string; trackingNumber: string | null; totalAmount: number; createdAt: string; testMode: boolean;
  items: {
    id: string; name: string; quantity: number; unitPrice: number;
    creatorName: string | null; fulfillmentStatus: string | null;
    trackingNumber: string | null; courier: string | null; trackingUrl: string | null;
  }[];
};

export function normalizeTrackingPhone(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 40) return null;
  const digits = value.replace(/\D/g, '');
  // Retain historical +91/leading-zero tolerance without accepting empty phones.
  return digits.length >= 10 && digits.length <= 15 ? digits.slice(-10) : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function customerTrackingUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2000) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

/** A deliberate customer DTO; never spread raw orders/items/creator records. */
export function customerOrderTracking(
  order: TrackingOrderRecord,
  items: TrackingItemRecord[],
  creators: Map<string, string>,
): CustomerOrderTracking {
  return {
    status: order.status, trackingNumber: text(order.tracking_number), totalAmount: order.total_amount,
    createdAt: order.created_at, testMode: order.is_test === true,
    items: items.map(item => {
      const trackingNumber = text(item.tracking_number);
      const trackingUrl = customerTrackingUrl(item.tracking_url);
      let fulfillmentStatus = text(item.fulfillment_status);
      // Old orders gained an awaiting_acceptance default during migration. Do not
      // let that placeholder contradict their recorded shipped/delivered status.
      if (['shipped', 'delivered'].includes(order.status) && !item.creator_id && !trackingNumber && !trackingUrl &&
          fulfillmentStatus === 'awaiting_acceptance') fulfillmentStatus = null;
      return {
        id: item.id, name: text(item.product_name) ?? text(item.products?.name) ?? 'Product',
        quantity: item.quantity, unitPrice: item.unit_price,
        creatorName: item.creator_id ? text(creators.get(item.creator_id)) : null,
        fulfillmentStatus, trackingNumber, courier: text(item.courier), trackingUrl,
      };
    }),
  };
}
