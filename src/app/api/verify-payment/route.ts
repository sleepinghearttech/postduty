import { NextRequest, NextResponse } from "next/server";
import { CheckoutError, parseCustomer, paymentConfiguration, record, validHmac } from "@/lib/checkout-contract";
import { verifyAndFinalize } from "@/lib/checkout-server";

export async function POST(request: NextRequest) {
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 100_000) throw new CheckoutError("Request is too large.",413);
    const raw = await request.text();
    if (raw.length > 100_000) throw new CheckoutError("Request is too large.",413);
    const config = paymentConfiguration(process.env);
    const webhookSignature = request.headers.get("x-razorpay-signature");
    if (webhookSignature !== null) {
      if (!validHmac(raw,webhookSignature,process.env.RAZORPAY_WEBHOOK_SECRET)) throw new CheckoutError("Invalid webhook signature.");
      const event = record(JSON.parse(raw));
      if (event.event !== "payment.captured") return NextResponse.json({received:true});
      const entity = record(record(record(event.payload).payment).entity);
      if (typeof entity.id !== "string" || typeof entity.order_id !== "string") throw new CheckoutError("Invalid payment reference.");
      const result = await verifyAndFinalize(entity.order_id,entity.id);
      return NextResponse.json({received:true,status:result.status,orderId:result.order_id},{headers:{"Cache-Control":"no-store"}});
    }
    const body = record(JSON.parse(raw));
    const {razorpayOrderId,razorpayPaymentId,razorpaySignature} = body;
    if (typeof razorpayOrderId !== "string" || typeof razorpayPaymentId !== "string" || !validHmac(`${razorpayOrderId}|${razorpayPaymentId}`,razorpaySignature,config.secret)) throw new CheckoutError("Invalid payment signature.");
    // Legacy clients send totals/items here. Deliberately ignore every financial field.
    // Customer details can fill an empty legacy intent once, never overwrite a saved address.
    const result = await verifyAndFinalize(razorpayOrderId,razorpayPaymentId,parseCustomer(body));
    if (result.status !== "confirmed") return NextResponse.json({error:"Payment was captured, but this order needs owner review before confirmation. Keep your payment reference and contact support.",status:result.status},{status:409});
    return NextResponse.json({success:true,orderId:result.order_id,testMode:config.testMode},{headers:{"Cache-Control":"no-store"}});
  } catch (error) {
    const known = error instanceof CheckoutError;
    return NextResponse.json({error:known ? error.message : "Invalid payment request."},{status:known ? error.status : 400});
  }
}
