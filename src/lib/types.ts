export type Storefront = "general" | "christmas";
export type ProductMedia = { url: string; type: "image" | "video"; alt: string; attribution?: string };
export type ProductVariant = { id: string; name: string; sku?: string; price: number; stock: number };
export type ProductCommerce = {
  sku?: string; category?: string; storefronts?: Storefront[]; collections?: string[];
  short_description?: string; materials?: string; tags?: string[]; media?: ProductMedia[];
  variants?: ProductVariant[];
  personalization?: { enabled: boolean; label: string; max_length: number; required: boolean };
  made_to_order?: boolean; preparation_days?: number; capacity?: number; low_stock_threshold?: number;
  featured?: boolean; archived?: boolean; catalog_only?: boolean; seo_title?: string; seo_description?: string;
  faqs?: { question: string; answer: string }[]; dimensions?: string; weight_grams?: number; shipping_method?: string;
  hsn?: string; // HSN code (4, 6 or 8 digits)
  combo?: { components: { product_id: string; quantity: number }[] }; // owner-defined bundle of existing products
  gst_rate_bps?: number; // GST rate in basis points (1800 = 18%)
};

export type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number; // always in paise
  image_url: string | null;
  stock: number;
  is_active: boolean;
  customisation_note?: string | null; // private supplier note; not read by the public storefront
  created_at: string;
  updated_at?: string;
  commerce?: ProductCommerce;
  creator_id?: string | null;
};

export type OwnerProduct = Product & { operations?: Record<string, unknown> };

export type OrderStatus = "pending" | "paid" | "shipped" | "delivered" | "cancelled" | "refunded";

/** Structured delivery address captured at checkout (legacy orders only have `shipping_address`). */
export type ShippingDetails = {
  name?: string; phone?: string; email?: string; address?: string;
  address_line1?: string; address_line2?: string | null; city?: string; state?: string; state_code?: string; pincode?: string; country?: string; delivery_method?: "standard" | "same_day";
};

/** Order line as used in owner alerts, the orders view and packing slips. */
export type OrderLineSummary = {
  product_name?: string | null; quantity: number; variant_id?: string | null; variant_name?: string | null;
  personalization?: { text?: string } | null;
  products?: { name: string } | null;
};

export type Order = {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  shipping_address: string;
  total_amount: number; // paise
  is_test?: boolean;
  payment_mode?: "test" | "live" | null;
  status: OrderStatus;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  tracking_number: string | null;
  coupon_code: string | null;
  discount_amount: number; // paise, 0 if no coupon
  shipping_amount?: number; // paise; 0 for legacy orders
  tax_breakdown?: Record<string, unknown> | null;
  shipping_details?: ShippingDetails | null;
  cancelled_at?: string | null;
  refunded_at?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  courier_cost_paise?: number | null; // owner-entered actual courier cost; null = not entered
  is_gift: boolean;
  gift_message: string | null;
  delivered_at: string | null;
  followup_day1_sent: boolean;
  followup_day5_sent: boolean;
  winback_sent: boolean;
  created_at: string;
};

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number; // paise, snapshotted at purchase time
  created_at: string;
  product_name?: string | null;
  variant_id?: string | null;
  variant_name?: string | null;
  personalization?: { text?: string } | null;
  creator_id?: string | null;
  combo_role?: 'combo' | 'component' | null;
};

/** Private creator pickup address (owner only). */
export type CreatorPickup = { creator_id: string; pickup_name: string; phone: string; address: string; pincode: string; shiprocket_location: string | null; display_name?: string };

export type OrderItemWithProduct = OrderItem & {
  products: { name: string } | null;
};

export type OrderWithItems = Order & {
  order_items: OrderItemWithProduct[];
};

export type Coupon = {
  id: string;
  code: string;
  discount_type: "percent" | "flat"; // 'percent' = % off, 'flat' = ₹ off (in paise)
  discount_value: number; // percent (10 = 10%) or paise (5000 = ₹50)
  min_order: number; // minimum cart total in paise to apply
  max_uses: number | null; // null = unlimited
  times_used: number;
  expires_at: string | null; // null = never expires
  referrer_code: string | null; // links to ambassador ref code, if any
  is_active: boolean;
  created_at: string;
};
