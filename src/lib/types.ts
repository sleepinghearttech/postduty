export type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number; // always in paise
  image_url: string | null;
  stock: number;
  is_active: boolean;
  customisation_note: string | null;
  created_at: string;
};

export type OrderStatus = "pending" | "paid" | "shipped" | "delivered";

export type Order = {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  shipping_address: string;
  total_amount: number; // paise
  status: OrderStatus;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  tracking_number: string | null;
  coupon_code: string | null;
  discount_amount: number; // paise, 0 if no coupon
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
};

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
