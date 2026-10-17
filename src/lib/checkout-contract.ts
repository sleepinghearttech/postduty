import { createHmac, timingSafeEqual } from "node:crypto";

export class CheckoutError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export type Storefront = "general" | "christmas";
export type CheckoutLine = { product_id: string; product_name: string; quantity: number; unit_price: number; variant_id: string | null; variant_name: string | null; personalization: string | null; creator_id: string | null; commission_bps:number; line_discount_amount:number; commission_amount:number; creator_earning_paise:number|null; hsn: string | null; gst_rate_bps: number | null };
/** Structured fields are present for every new checkout; legacy callers only ever supplied the composed `address`. */
export type CheckoutCustomer = {
  name: string; email: string; phone: string; address: string;
  address_line1?: string; address_line2?: string | null; city?: string; state_code?: string; state?: string; pincode?: string; country?: "IN";
  terms_accepted_at?: string;
};
export type CheckoutProduct = {
  id: string; name: string; price: number; stock: number; is_active: boolean; creator_id?: string | null;
  commerce?: { storefronts?: Storefront[]; archived?: boolean; catalog_only?:boolean; made_to_order?:boolean; variants?: {id:string;name:string;price:number;stock:number}[]; personalization?: {enabled:boolean;required:boolean;max_length:number}; hsn?: string; gst_rate_bps?: number } | null;
};
export type CheckoutCreator = { id:string; status:string; commission_bps:number };
export type CheckoutCoupon = { code:string; is_active:boolean; expires_at:string|null; max_uses:number|null; times_used:number; min_order:number; discount_type:string; discount_value:number };
export type CheckoutRequest = { items: {productId:string;quantity:number;variantId?:string;personalization?:string}[]; storefront:Storefront; isGift:boolean; giftMessage:string|null; couponCode:string|null; customer:CheckoutCustomer|null; termsAccepted:boolean };

// ─── Delivery rules (owner-approved) ─────────────────────────────────────────
/** GST state/UT codes. Code 25 (Daman and Diu) merged into 26 in 2020 and is not offered. */
export const INDIAN_STATES: readonly { code: string; name: string }[] = [
  {code:"35",name:"Andaman and Nicobar Islands"},{code:"37",name:"Andhra Pradesh"},{code:"12",name:"Arunachal Pradesh"},{code:"18",name:"Assam"},
  {code:"10",name:"Bihar"},{code:"04",name:"Chandigarh"},{code:"22",name:"Chhattisgarh"},{code:"26",name:"Dadra and Nagar Haveli and Daman and Diu"},
  {code:"07",name:"Delhi"},{code:"30",name:"Goa"},{code:"24",name:"Gujarat"},{code:"06",name:"Haryana"},{code:"02",name:"Himachal Pradesh"},
  {code:"01",name:"Jammu and Kashmir"},{code:"20",name:"Jharkhand"},{code:"29",name:"Karnataka"},{code:"32",name:"Kerala"},{code:"38",name:"Ladakh"},
  {code:"31",name:"Lakshadweep"},{code:"23",name:"Madhya Pradesh"},{code:"27",name:"Maharashtra"},{code:"14",name:"Manipur"},{code:"17",name:"Meghalaya"},
  {code:"15",name:"Mizoram"},{code:"13",name:"Nagaland"},{code:"21",name:"Odisha"},{code:"34",name:"Puducherry"},{code:"03",name:"Punjab"},
  {code:"08",name:"Rajasthan"},{code:"11",name:"Sikkim"},{code:"33",name:"Tamil Nadu"},{code:"36",name:"Telangana"},{code:"16",name:"Tripura"},
  {code:"09",name:"Uttar Pradesh"},{code:"05",name:"Uttarakhand"},{code:"19",name:"West Bengal"},
];
const stateByCode = new Map(INDIAN_STATES.map(s => [s.code,s.name]));
export function stateName(code: string): string | null { return stateByCode.get(code) ?? null; }
export const SINGLE_ITEM_SHIPPING_PAISE = 4900;
/** ₹49 when the order holds exactly one unit in total; free from two units. */
export function shippingChargeFor(totalQuantity: number): number {
  if (!Number.isSafeInteger(totalQuantity) || totalQuantity < 1) throw new CheckoutError("Cart must contain at least one item.");
  return totalQuantity === 1 ? SINGLE_ITEM_SHIPPING_PAISE : 0;
}
/** Empty/unset = every state served. Unknown codes are ignored; a non-empty list with no valid code serves nothing (fails closed). */
export function parseAllowedStates(value: string | undefined | null): Set<string> | null {
  if (!value || !value.trim()) return null;
  return new Set(value.split(",").map(code => code.trim().padStart(2,"0")).filter(code => stateByCode.has(code)));
}
export function servedStates(allowed: Set<string> | null) { return INDIAN_STATES.filter(s => !allowed || allowed.has(s.code)); }
export function assertShippingState(stateCode: string | undefined, allowed: Set<string> | null): void {
  if (!stateCode || !stateByCode.has(stateCode)) throw new CheckoutError("Select the state or union territory for delivery.");
  if (allowed && !allowed.has(stateCode)) {
    const names = servedStates(allowed).map(s => s.name);
    throw new CheckoutError(names.length ? `We do not deliver to ${stateName(stateCode)} yet. We currently deliver to: ${names.join(", ")}.` : "Delivery is temporarily unavailable. No payment has been taken.", 422);
  }
}
export function validPincode(value: unknown): value is string { return typeof value === "string" && /^[1-9][0-9]{5}$/.test(value); }
/** Accepts +91 / 91 / 0 prefixes and common separators; returns the 10-digit mobile number. */
export function normalizeIndianMobile(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 25 || !/^[+\d\s()-]+$/.test(value)) return null;
  let digits = value.replace(/\D/g,"");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}
export function composeAddress(parts: {address_line1:string;address_line2?:string|null;city:string;state:string;pincode:string}): string {
  return [parts.address_line1,parts.address_line2,parts.city,`${parts.state} - ${parts.pincode}`].filter(Boolean).join(", ");
}

// ─── GST (prices are GST-inclusive) ──────────────────────────────────────────
export const GST_RATE_BPS = [0,10,25,150,300,500,1200,1800,2800,4000] as const;
export function validGstRateBps(value: unknown): value is number { return typeof value === "number" && (GST_RATE_BPS as readonly number[]).includes(value); }
export function validHsn(value: unknown): value is string { return typeof value === "string" && /^(\d{4}|\d{6}|\d{8})$/.test(value); }
/** Exact integer half-up rounding of numerator/denominator for non-negative integers. */
function roundDiv(numerator: number, denominator: number): number { return Math.floor((2 * numerator + denominator) / (2 * denominator)); }
/** Tax contained in a GST-inclusive amount: amount × rate / (100 + rate), half-up to the paisa. */
export function inclusiveTax(amount: number, rateBps: number): number { return roundDiv(amount * rateBps, 10000 + rateBps); }
export type TaxPart = { taxable_value:number; cgst:number; sgst:number; igst:number };
export type TaxLine = {
  line_index:number; product_id:string; hsn:string|null; gst_rate_bps:number|null;
  /** Goods value after this line's share of the coupon discount (GST-inclusive). */
  gross:number; taxable_value:number; cgst:number; sgst:number; igst:number;
  /** Composite-supply shares of the shipping and gift charges, taxed at this line's rate. */
  shipping_share:number; gift_share:number; shipping:TaxPart; gift:TaxPart;
};
export type TaxBreakdown = {
  regime:"intra_state"|"inter_state"; seller_state_code:string; place_of_supply:string; gst_registered:boolean; prices_include_gst:true;
  lines:TaxLine[]; charges:{shipping:TaxPart & {amount:number}; gift:TaxPart & {amount:number}};
  taxable_value:number; cgst:number; sgst:number; igst:number; total_tax:number; complete:boolean; basis:"composite_supply_v2";
};
/**
 * Largest-remainder split of `total` in proportion to `weights` (integers ≥ 0). Every paisa is allocated;
 * equal remainders go to the earlier line. Zero weights everywhere fall back to an equal split.
 */
export function allocateByWeight(total: number, weights: number[]): number[] {
  if (!weights.length) return [];
  const basis = weights.some(w => w > 0) ? weights : weights.map(() => 1);
  const sum = basis.reduce((a,b) => a + b,0);
  const shares = basis.map((w,index) => ({index,paise:Math.floor(total * w / sum),remainder:(total * w) % sum}));
  const residual = total - shares.reduce((a,s) => a + s.paise,0);
  [...shares].sort((a,b) => b.remainder - a.remainder || a.index - b.index).slice(0,residual).forEach(s => { shares[s.index].paise++; });
  return shares.map(s => s.paise);
}
function taxPart(amount: number, rate: number | null, intra: boolean): TaxPart {
  let cgst = 0, sgst = 0, igst = 0;
  if (rate !== null && rate > 0) {
    if (intra) { cgst = roundDiv(amount * rate, 2 * (10000 + rate)); sgst = cgst; }
    else igst = inclusiveTax(amount,rate);
  }
  return {taxable_value:amount-cgst-sgst-igst,cgst,sgst,igst};
}
/**
 * Same state → CGST and SGST at half the rate each (computed separately so the two are always equal);
 * otherwise IGST at the full rate. Shipping and the gift card are a composite supply: each is allocated
 * across lines in proportion to line value after discount and taxed at that line's goods rate.
 * Lines without an owner-entered rate carry no tax and mark the breakdown incomplete.
 */
export function gstBreakdown(lines: Pick<CheckoutLine,"product_id"|"quantity"|"unit_price"|"line_discount_amount"|"hsn"|"gst_rate_bps">[], customerStateCode: string, sellerStateCode: string, gstRegistered: boolean, charges: {shipping?:number; gift?:number} = {}): TaxBreakdown {
  const intra = customerStateCode === sellerStateCode;
  const grossValues = lines.map(line => line.quantity * line.unit_price - line.line_discount_amount);
  // A fully discounted basket still needs a deterministic split: fall back to pre-discount value.
  const weights = grossValues.some(v => v > 0) ? grossValues : lines.map(line => line.quantity * line.unit_price);
  const shippingAmount = charges.shipping ?? 0, giftAmount = charges.gift ?? 0;
  const shippingShares = allocateByWeight(shippingAmount,weights), giftShares = allocateByWeight(giftAmount,weights);
  const taxLines: TaxLine[] = lines.map((line,index) => {
    const gross = grossValues[index], rate = line.gst_rate_bps;
    const goods = taxPart(gross,rate,intra);
    return {line_index:index,product_id:line.product_id,hsn:line.hsn,gst_rate_bps:rate,gross,...goods,shipping_share:shippingShares[index],gift_share:giftShares[index],shipping:taxPart(shippingShares[index],rate,intra),gift:taxPart(giftShares[index],rate,intra)};
  });
  const total = (pick: (line: TaxLine) => TaxPart) => {
    const parts = taxLines.map(pick);
    return {taxable_value:parts.reduce((a,p)=>a+p.taxable_value,0),cgst:parts.reduce((a,p)=>a+p.cgst,0),sgst:parts.reduce((a,p)=>a+p.sgst,0),igst:parts.reduce((a,p)=>a+p.igst,0)};
  };
  const goods = total(line => line), shipping = total(line => line.shipping), gift = total(line => line.gift);
  const cgst = goods.cgst + shipping.cgst + gift.cgst, sgst = goods.sgst + shipping.sgst + gift.sgst, igst = goods.igst + shipping.igst + gift.igst;
  return {regime:intra?"intra_state":"inter_state",seller_state_code:sellerStateCode,place_of_supply:customerStateCode,gst_registered:gstRegistered,prices_include_gst:true,lines:taxLines,
    charges:{shipping:{amount:shippingAmount,...shipping},gift:{amount:giftAmount,...gift}},
    taxable_value:goods.taxable_value+shipping.taxable_value+gift.taxable_value,cgst,sgst,igst,total_tax:cgst+sgst+igst,complete:taxLines.every(line => line.gst_rate_bps !== null),basis:"composite_supply_v2"};
}
export function gstRegistered(env: Record<string,string|undefined>): boolean { return env.GST_REGISTERED?.trim() === "true"; }
/**
 * Seller GST state. Unregistered sellers default to Karnataka (29) for the internal breakdown; a GST-registered
 * seller must configure a valid code explicitly, so checkout fails closed rather than guessing the tax regime.
 */
export function sellerStateCode(env: Record<string,string|undefined>): string {
  const raw = (env.SELLER_STATE_CODE ?? "").trim();
  if (!raw && gstRegistered(env)) throw new CheckoutError("Seller tax configuration needs owner review (SELLER_STATE_CODE is not set). No payment has been taken.",503);
  const code = raw || "29";
  if (!stateByCode.has(code)) throw new CheckoutError("Seller tax configuration needs owner review (SELLER_STATE_CODE is invalid). No payment has been taken.",503);
  return code;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new CheckoutError("Invalid request."); return value as Record<string, unknown>; }
function boundedText(value: unknown, max: number, field: string): string { if (typeof value !== "string" || value.trim().length > max || /[<>\x00-\x08\x0B\x0C\x0E-\x1F]/.test(value)) throw new CheckoutError(`Invalid ${field}.`); return value.trim(); }
const structuredKeys = ["addressLine1","addressLine2","city","stateCode","pincode"] as const;
export function parseCustomer(body: Record<string, unknown>): CheckoutCustomer | null {
  if (structuredKeys.some(key => body[key] !== undefined)) return parseDeliveryAddress(body);
  if (![body.customerName,body.customerEmail,body.customerPhone,body.shippingAddress].some(v => v !== undefined)) return null;
  const name = boundedText(body.customerName,100,"customer name");
  const email = boundedText(body.customerEmail,254,"email").toLowerCase();
  const phone = boundedText(body.customerPhone,25,"phone");
  const address = boundedText(body.shippingAddress,1000,"shipping address");
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\+?[\d ()-]{8,25}$/.test(phone) || address.length < 10) throw new CheckoutError("Enter a valid name, email, phone and full shipping address.");
  return {name,email,phone,address};
}
/** Structured Indian delivery address; the composed single line stays in `address` for existing consumers. */
export function parseDeliveryAddress(body: Record<string, unknown>): CheckoutCustomer {
  const name = boundedText(body.customerName,100,"customer name");
  if (name.length < 2) throw new CheckoutError("Enter the recipient's full name.");
  const email = boundedText(body.customerEmail,254,"email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CheckoutError("Enter a valid email address.");
  const phone = normalizeIndianMobile(body.customerPhone);
  if (!phone) throw new CheckoutError("Enter a valid 10-digit Indian mobile number.");
  const address_line1 = boundedText(body.addressLine1,200,"address line 1");
  if (address_line1.length < 3) throw new CheckoutError("Enter the house/flat number and street in address line 1.");
  const line2 = body.addressLine2 == null ? "" : boundedText(body.addressLine2,200,"address line 2");
  const city = boundedText(body.city,100,"city");
  if (city.length < 2) throw new CheckoutError("Enter the city or town.");
  const state_code = typeof body.stateCode === "string" ? body.stateCode.trim() : "";
  const state = stateName(state_code);
  if (!state) throw new CheckoutError("Select the state or union territory for delivery.");
  const pincode = typeof body.pincode === "string" ? body.pincode.trim() : "";
  if (!validPincode(pincode)) throw new CheckoutError("Enter a valid 6-digit PIN code.");
  const address_line2 = line2 || null;
  return {name,email,phone,address:composeAddress({address_line1,address_line2,city,state,pincode}),address_line1,address_line2,city,state_code,state,pincode,country:"IN"};
}
/** New checkouts need a structured, served delivery address and explicit terms acceptance before any payment is created. */
export function assertCheckoutReady(request: CheckoutRequest, allowed: Set<string> | null): CheckoutCustomer {
  if (!request.customer?.state_code || !request.customer.pincode) throw new CheckoutError("Enter your full delivery address, including state and PIN code.");
  assertShippingState(request.customer.state_code,allowed);
  if (!request.termsAccepted) throw new CheckoutError("Please accept the Terms of Service, Refund and Shipping policies to continue.");
  return request.customer;
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
  return {items,storefront:(body.storefront ?? "general") as Storefront,isGift:body.isGift === true,giftMessage:body.isGift && body.giftMessage ? boundedText(body.giftMessage,200,"gift message") : null,couponCode:body.couponCode ? boundedText(body.couponCode,40,"coupon").toUpperCase() : null,customer:parseCustomer(body),termsAccepted:body.acceptTerms === true};
}
export type SnapshotOptions = { sellerStateCode?: string; gstRegistered?: boolean };
export function buildCheckoutSnapshot(request: CheckoutRequest, products: CheckoutProduct[], coupon: CheckoutCoupon | null, now = Date.now(), creators:CheckoutCreator[] = [], options: SnapshotOptions = {}) {
  const demand = new Map<string,number>();
  const lines: CheckoutLine[] = request.items.map(item => {
    const p = products.find(p => p.id === item.productId);
    if (!p || !p.is_active || p.commerce?.archived || p.commerce?.catalog_only || !(p.commerce?.storefronts ?? ["general"]).includes(request.storefront)) throw new CheckoutError("A cart product is unavailable on this storefront.",409);
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
    const rawHsn = p.commerce?.hsn, rawRate = p.commerce?.gst_rate_bps;
    const hsn = validHsn(rawHsn) ? rawHsn : null;
    const gstRate = validGstRateBps(rawRate) ? rawRate : null;
    // A GST-registered seller must never charge an unknown rate: fail closed before any payment.
    if (options.gstRegistered && gstRate === null) throw new CheckoutError(`${p.name} cannot be ordered yet: the owner must set its GST rate in the product admin. No payment has been taken.`,409);
    return {product_id:p.id,product_name:p.name,quantity:item.quantity,unit_price:price,variant_id:variant?.id ?? null,variant_name:variant?.name ?? null,personalization,creator_id:p.creator_id ?? null,commission_bps:creator?.commission_bps ?? 0,line_discount_amount:0,commission_amount:0,creator_earning_paise:null,hsn,gst_rate_bps:gstRate};
  });
  const subtotal = lines.reduce((sum,line) => sum + line.unit_price * line.quantity,0);
  if (!Number.isSafeInteger(subtotal) || subtotal < 100 || subtotal > 50_000_000) throw new CheckoutError("Merchandise total is outside the supported payment range.");
  const giftCharge = request.isGift ? 2000 : 0;
  let discountAmount = 0;
  if (request.couponCode) {
    if (!coupon || !coupon.is_active || (coupon.expires_at && Date.parse(coupon.expires_at) < now) || (coupon.max_uses !== null && coupon.times_used >= coupon.max_uses) || subtotal + giftCharge < coupon.min_order || !Number.isSafeInteger(coupon.discount_value) || coupon.discount_value < 0 || !["percent","flat"].includes(coupon.discount_type)) throw new CheckoutError("That coupon is no longer available. Remove it or use another code.",409);
    // Coupons discount merchandise only: never the gift card or shipping.
    discountAmount = Math.min(subtotal,coupon.discount_type === "percent" ? Math.round(subtotal * coupon.discount_value / 100) : coupon.discount_value);
  }
  const shippingCharge = shippingChargeFor(lines.reduce((sum,line) => sum + line.quantity,0));
  const totalAmount = subtotal + giftCharge + shippingCharge - discountAmount;
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
  const stateCode = request.customer?.state_code;
  const taxBreakdown = stateCode ? gstBreakdown(lines,stateCode,options.sellerStateCode ?? "29",options.gstRegistered === true,{shipping:shippingCharge,gift:giftCharge}) : null;
  return {lines,subtotal,giftCharge,shippingCharge,discountAmount,totalAmount,couponCode:request.couponCode,taxBreakdown};
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
