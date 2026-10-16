import { createHmac, timingSafeEqual } from "node:crypto";

export class CheckoutError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export type Storefront = "general" | "christmas";
export type CheckoutLine = { product_id: string; product_name: string; quantity: number; unit_price: number; variant_id: string | null; personalization: string | null; creator_id: string | null; commission_bps:number; line_discount_amount:number; commission_amount:number; creator_earning_paise:number|null };
export type CheckoutCustomer = { name: string; email: string; phone: string; address: string };
export type CheckoutProduct = {
  id: string; name: string; price: number; stock: number; is_active: boolean; creator_id?: string | null;
  commerce?: { storefronts?: Storefront[]; archived?: boolean; made_to_order?:boolean; variants?: {id:string;name:string;price:number;stock:number}[]; personalization?: {enabled:boolean;required:boolean;max_length:number}; } | null;
};
export type CheckoutCreator = { id:string; status:string; commission_bps:number };
export type CheckoutCoupon = { code:string; is_active:boolean; expires_at:string|null; max_uses:number|null; times_used:number; min_order:number; discount_type:string; discount_value:number };
export type CheckoutRequest = { items: {productId:string;quantity:number;variantId?:string;personalization?:string}[]; storefront:Storefront; isGift:boolean; giftMessage:string|null; couponCode:string|null; customer:CheckoutCustomer|null };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new CheckoutError("Invalid request."); return value as Record<string, unknown>; }
function boundedText(value: unknown, max: number, field: string): string { if (typeof value !== "string" || value.trim().length > max || /[<>\x00-\x08\x0B\x0C\x0E-\x1F]/.test(value)) throw new CheckoutError(`Invalid ${field}.`); return value.trim(); }
export function parseCustomer(body: Record<string, unknown>): CheckoutCustomer | null {
  if (![body.customerName,body.customerEmail,body.customerPhone,body.shippingAddress].some(v => v !== undefined)) return null;
  const name = boundedText(body.customerName,100,"customer name");
  const email = boundedText(body.customerEmail,254,"email").toLowerCase();
  const phone = boundedText(body.customerPhone,25,"phone");
  const address = boundedText(body.shippingAddress,1000,"shipping address");
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\+?[\d ()-]{8,25}$/.test(phone) || address.length < 10) throw new CheckoutError("Enter a valid name, email, phone and full shipping address.");
  return {name,email,phone,address};
}
export function parseCheckoutRequest(value: unknown): CheckoutRequest {
  const body = record(value);
  const rawItems = body.items ?? (body.productId ? [{productId:body.productId,quantity:body.quantity,variantId:body.variantId,personalization:body.personalization}] : []);
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > 50) throw new CheckoutError("Cart must contain 1–50 items.");
  const items = rawItems.map(raw => {
    const i = record(raw);
    if (typeof i.productId !== "string" || !uuid.test(i.productId) || typeof i.quantity !== "number" || !Number.isSafeInteger(i.quantity) || i.quantity < 1 || i.quantity > 100) throw new CheckoutError("Invalid product or quantity.");
    const variantId = i.variantId == null ? undefined : boundedText(i.variantId,100,"variant");
    const personalization = i.personalization == null ? undefined : boundedText(i.personalization,500,"personalization");
    return {productId:i.productId, quantity:i.quantity, variantId, personalization};
  });
  if (body.storefront !== undefined && body.storefront !== "general" && body.storefront !== "christmas") throw new CheckoutError("Invalid storefront.");
  if (body.isGift !== undefined && typeof body.isGift !== "boolean") throw new CheckoutError("Invalid gift option.");
  return {items,storefront:(body.storefront ?? "general") as Storefront,isGift:body.isGift === true,giftMessage:body.isGift && body.giftMessage ? boundedText(body.giftMessage,200,"gift message") : null,couponCode:body.couponCode ? boundedText(body.couponCode,40,"coupon").toUpperCase() : null,customer:parseCustomer(body)};
}
export function buildCheckoutSnapshot(request: CheckoutRequest, products: CheckoutProduct[], coupon: CheckoutCoupon | null, now = Date.now(), creators:CheckoutCreator[] = []) {
  const demand = new Map<string,number>();
  const lines: CheckoutLine[] = request.items.map(item => {
    const p = products.find(p => p.id === item.productId);
    if (!p || !p.is_active || p.commerce?.archived || !(p.commerce?.storefronts ?? ["general"]).includes(request.storefront)) throw new CheckoutError("A cart product is unavailable on this storefront.",409);
    const creator = p.creator_id ? creators.find(c => c.id === p.creator_id) : null;
    if (p.creator_id && (!creator || creator.status !== "active" || !Number.isSafeInteger(creator.commission_bps) || creator.commission_bps < 0 || creator.commission_bps > 10000)) throw new CheckoutError("A creator product is temporarily unavailable pending owner review.",409);
    const variants = p.commerce?.variants ?? [];
    const variant = variants.find(v => v.id === item.variantId);
    if ((variants.length > 0 && !variant) || (item.variantId && !variant)) throw new CheckoutError(`Choose an available option for ${p.name}.`);
    const price = variant?.price ?? p.price;
    if (!Number.isSafeInteger(price) || price < 100) throw new CheckoutError("Product pricing needs owner review.",409);
    const key = `${p.id}:${variant?.id ?? ""}`;
    const quantity = (demand.get(key) ?? 0) + item.quantity;
    demand.set(key,quantity);
    if (!Number.isSafeInteger(variant?.stock ?? p.stock) || (variant?.stock ?? p.stock) < quantity) throw new CheckoutError(`Not enough ${p.commerce?.made_to_order ? "production slots" : "stock"} for ${p.name}.`,409);
    // Parent stock is the shared physical inventory; variants cannot bypass it.
    const parentKey = `all:${p.id}`;
    const allQuantity = (demand.get(parentKey) ?? 0) + item.quantity;
    demand.set(parentKey,allQuantity);
    if (p.stock < allQuantity) throw new CheckoutError(`Not enough ${p.commerce?.made_to_order ? "production slots" : "stock"} for ${p.name}.`,409);
    const personalization = item.personalization || null;
    const rules = p.commerce?.personalization;
    if (personalization && !rules?.enabled) throw new CheckoutError(`Personalization is unavailable for ${p.name}.`);
    if (rules?.enabled && ((rules.required && !personalization) || (personalization && personalization.length > Math.min(rules.max_length,500)))) throw new CheckoutError(`Check the personalization for ${p.name}.`);
    return {product_id:p.id,product_name:p.name,quantity:item.quantity,unit_price:price,variant_id:variant?.id ?? null,personalization,creator_id:p.creator_id ?? null,commission_bps:creator?.commission_bps ?? 0,line_discount_amount:0,commission_amount:0,creator_earning_paise:null};
  });
  const subtotal = lines.reduce((sum,line) => sum + line.unit_price * line.quantity,0);
  if (!Number.isSafeInteger(subtotal) || subtotal < 100 || subtotal > 50_000_000) throw new CheckoutError("Merchandise total is outside the supported payment range.");
  const giftCharge = request.isGift ? 2000 : 0;
  let discountAmount = 0;
  if (request.couponCode) {
    if (!coupon || !coupon.is_active || (coupon.expires_at && Date.parse(coupon.expires_at) < now) || (coupon.max_uses !== null && coupon.times_used >= coupon.max_uses) || subtotal + giftCharge < coupon.min_order || !Number.isSafeInteger(coupon.discount_value) || coupon.discount_value < 0 || !["percent","flat"].includes(coupon.discount_type)) throw new CheckoutError("That coupon is no longer available. Remove it or use another code.",409);
    discountAmount = Math.min(subtotal,coupon.discount_type === "percent" ? Math.round(subtotal * coupon.discount_value / 100) : coupon.discount_value);
  }
  const totalAmount = subtotal + giftCharge - discountAmount;
  if (!Number.isSafeInteger(totalAmount) || totalAmount < 100 || totalAmount > 50_000_000) throw new CheckoutError("Order total is outside the supported payment range.");
  // Allocate the exact order discount across merchandise only (never the gift card).
  // Largest remainder keeps every paise accounted for; input order breaks equal ties.
  const allocation = lines.map((line,index) => {
    const numerator = discountAmount * line.quantity * line.unit_price;
    return {index,paise:Math.floor(numerator / subtotal),remainder:numerator % subtotal};
  });
  const residual = discountAmount - allocation.reduce((sum,a) => sum + a.paise,0);
  const priority = [...allocation].sort((a,b) => b.remainder-a.remainder || a.index-b.index);
  for (let i=0;i<residual;i++) allocation[priority[i].index].paise++;
  for (const [index,line] of lines.entries()) {
    line.line_discount_amount = allocation[index].paise;
    const net = line.quantity * line.unit_price - line.line_discount_amount;
    line.commission_amount = line.creator_id ? Math.round(net * line.commission_bps / 10000) : 0;
    line.creator_earning_paise = line.creator_id ? net - line.commission_amount : null;
  }
  return {lines,subtotal,giftCharge,discountAmount,totalAmount,couponCode:request.couponCode};
}
export function paymentConfiguration(env: Record<string,string|undefined>) {
  const keyId = env.RAZORPAY_KEY_ID?.trim();
  const secret = env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !secret || !/^rzp_(test|live)_\w+$/.test(keyId)) throw new CheckoutError("Payments are not configured. No payment has been taken.",503);
  const testMode = keyId.startsWith("rzp_test_");
  if (env.COMMERCE_SANDBOX === "true" && !testMode) throw new CheckoutError("Preview checkout only accepts test-mode payment credentials.",503);
  return {keyId,secret,testMode};
}
export function validHmac(message: string, signature: unknown, secret: string|undefined): boolean {
  if (!secret?.trim() || typeof signature !== "string" || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256",secret.trim()).update(message).digest();
  return timingSafeEqual(expected,Buffer.from(signature,"hex"));
}
export type CapturedPayment = {id:string;order_id:string;amount:number;currency:string;status:string;captured:boolean;amount_refunded?:number};
export function assertCapturedPayment(value: unknown, expected: {paymentId:string;orderId:string;amount:number;currency:string}): CapturedPayment {
  const p = record(value);
  if (p.id !== expected.paymentId || p.order_id !== expected.orderId || p.amount !== expected.amount || p.currency !== expected.currency || p.status !== "captured" || p.captured !== true || (typeof p.amount_refunded === "number" && p.amount_refunded !== 0)) throw new CheckoutError("Payment is not a matching captured payment. Order has not been confirmed.",409);
  return p as CapturedPayment;
}
