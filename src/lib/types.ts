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

export type OrderStatus = "pending" | "paid" | "shipped";

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
