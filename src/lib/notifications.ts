import { Order } from "@/lib/types";

/**
 * Normalizes a phone number to E.164 format without leading '+' or spaces
 * as required by Meta's WhatsApp Graph API.
 * e.g., "08903885758" -> "918903885758", "8903885758" -> "918903885758"
 */
function normalizePhoneNumber(phone: string): string {
  let clean = phone.replace(/\D/g, "");
  
  // If it's a domestic Indian number with leading 0 (e.g. 08903885758)
  if (clean.startsWith("0") && clean.length === 11) {
    clean = "91" + clean.slice(1);
  } else if (clean.length === 10) {
    // 10 digits, assume India country code (91)
    clean = "91" + clean;
  }
  
  return clean;
}

/**
 * Formats total amount in paise to Indian Rupees with ₹ symbol.
 * Used for free-form messages where we control the full text.
 * e.g., 19900 -> "₹199", 19950 -> "₹199.50"
 */
function formatRupees(amountInPaise: number): string {
  const rupees = amountInPaise / 100;
  return rupees % 1 === 0 ? `₹${rupees}` : `₹${rupees.toFixed(2)}`;
}

/**
 * Formats total amount in paise to a plain number string (no ₹ symbol).
 * Used for template parameters where the template body already includes ₹.
 * e.g., 19900 -> "199", 19950 -> "199.50"
 */
function formatRupeesPlain(amountInPaise: number): string {
  const rupees = amountInPaise / 100;
  return rupees % 1 === 0 ? `${rupees}` : rupees.toFixed(2);
}

/**
 * Sends a free-form text WhatsApp alert to the ADMIN_WHATSAPP_NUMBER.
 * IMPORTANT: free-form ("session") messages only deliver if the admin has
 * messaged the business number within the last 24h (Meta's session window).
 * Outside that window, Meta still returns 200/accepted but silently drops
 * the message — this was the root cause of the historic "green ticks, no
 * message" bug. Use sendAdminOrderAlert()/sendAdminShippedAlert() instead;
 * this is kept only as their fallback when the admin_order_alert template
 * isn't approved/available yet.
 */
async function sendAdminFreeformText(adminPhone: string, phoneNumberId: string, token: string, messageBody: string): Promise<void> {
  try {
    const response = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: adminPhone,
        type: "text",
        text: {
          preview_url: false,
          body: messageBody,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[WhatsApp Admin] Non-OK response from Meta API: Status: ${response.status}. Body: ${errText}`);
    } else {
      const data = await response.json();
      console.log("[WhatsApp Admin] Free-form alert sent (may silently not deliver outside the 24h session window). Response:", data);
    }
  } catch (err) {
    console.error("[WhatsApp Admin] Network/Internal error sending admin alert:", err);
  }
}

/**
 * Sends an admin alert via the admin_order_alert template (not session-gated
 * like free-form text). Falls back to free-form text if the template isn't
 * approved yet or the send fails for any reason.
 * Template body: "...Event: {{1}}. The related order ID is {{2}}, placed by
 * customer {{3}}. Additional details: {{4}}..." (submitted 2026-07-08, PENDING
 * approval — falls back automatically until Meta approves it).
 */
async function sendAdminAlert(event: string, orderId: string, customerName: string, details: string, fallbackBody: string): Promise<void> {
  const enabled = process.env.ORDER_NOTIFICATIONS_ENABLED === "true";
  if (!enabled) {
    console.log("[WhatsApp Admin] Notifications disabled (ORDER_NOTIFICATIONS_ENABLED !== true)");
    return;
  }

  const token = process.env.WHATSAPP_PERMANENT_TOKEN;
  const adminPhoneRaw = process.env.ADMIN_WHATSAPP_NUMBER;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "1222192880967535";

  if (!token || !adminPhoneRaw) {
    console.error("[WhatsApp Admin] Missing WHATSAPP_PERMANENT_TOKEN or ADMIN_WHATSAPP_NUMBER env variables");
    return;
  }

  const adminPhone = normalizePhoneNumber(adminPhoneRaw);

  try {
    const response = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: adminPhone,
        type: "template",
        template: {
          name: "admin_order_alert",
          language: { code: "en_IN" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: event },
                { type: "text", text: orderId },
                { type: "text", text: customerName },
                { type: "text", text: details },
              ],
            },
          ],
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[WhatsApp Admin] admin_order_alert template send failed (status ${response.status}). Falling back to free-form text. Body: ${errText}`);
      await sendAdminFreeformText(adminPhone, phoneNumberId, token, fallbackBody);
    } else {
      const data = await response.json();
      console.log("[WhatsApp Admin] Template alert sent successfully. Response:", data);
    }
  } catch (err) {
    console.error("[WhatsApp Admin] Network/Internal error sending admin template alert, falling back to free-form:", err);
    await sendAdminFreeformText(adminPhone, phoneNumberId, token, fallbackBody);
  }
}

/**
 * Sends an alert to the admin about a new order.
 */
export async function sendAdminWhatsAppAlert(order: Order): Promise<void> {
  const amountInRupees = formatRupees(order.total_amount);
  const fallbackBody = `🚨 *New PostDuty Order!*
Order ID: \`${order.id}\`
Customer: *${order.customer_name}*
Email: ${order.customer_email}
Phone: ${order.customer_phone}
Amount: *${amountInRupees}*

*Shipping Address:*
${order.shipping_address}`;

  await sendAdminAlert("New order received", order.id, order.customer_name, `Amount: ${amountInRupees}`, fallbackBody);
}

/**
 * Sends a structured WhatsApp template message (order_confirmation) to the customer.
 * Uses Meta Graph API v25.0.
 */
export async function sendCustomerWhatsAppConfirmation(order: Order): Promise<void> {
  const enabled = process.env.ORDER_NOTIFICATIONS_ENABLED === "true";
  if (!enabled) {
    console.log("[WhatsApp Customer] Notifications disabled (ORDER_NOTIFICATIONS_ENABLED !== true)");
    return;
  }

  const token = process.env.WHATSAPP_PERMANENT_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "1222192880967535";

  if (!token) {
    console.error("[WhatsApp Customer] Missing WHATSAPP_PERMANENT_TOKEN env variable");
    return;
  }

  const customerPhone = normalizePhoneNumber(order.customer_phone);
  // Use plain number — the template body already contains the ₹ symbol before {{3}}
  const amountPlain = formatRupeesPlain(order.total_amount);

  /**
   * Template fields configuration:
   * Template name: order_confirmation
   * Language: en_IN
   *
   * Actual template body (from Meta Business Manager):
   *   Hi {{1}}, your PostDuty order is confirmed! 🎉
   *   Order ID: {{2}}
   *   Total Amount: ₹{{3}}
   *   Our team is preparing your package for dispatch...
   *
   * Body parameter placeholders:
   * - {{1}} -> Customer Name (order.customer_name)
   * - {{2}} -> Order ID (order.id)
   * - {{3}} -> Total Amount as plain number (NO ₹ — template already has it)
   *
   * If you need to edit template details or add more fields later:
   * 1. Update the parameters array below to match the order & type of placeholders in Meta.
   * 2. Ensure template name and language match exactly what is approved in Meta Business Suite.
   */
  const payload = {
    messaging_product: "whatsapp",
    to: customerPhone,
    type: "template",
    template: {
      name: "order_confirmation",
      language: {
        code: "en_IN",
      },
      components: [
        {
          type: "body",
          parameters: [
            {
              type: "text",
              text: order.customer_name,
            },
            {
              type: "text",
              text: order.id,
            },
            {
              type: "text",
              text: amountPlain,
            },
          ],
        },
      ],
    },
  };

  try {
    const response = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[WhatsApp Customer] Non-OK response from Meta API: Status: ${response.status}. Body: ${errText}`);
    } else {
      const data = await response.json();
      console.log("[WhatsApp Customer] Confirmation template sent successfully. Response:", data);
    }
  } catch (err) {
    console.error("[WhatsApp Customer] Network/Internal error sending customer template confirmation:", err);
  }
}

/**
 * Sends a WhatsApp notification to the customer when the order is shipped.
 * Template: order_shipped
 * Params: 
 * {{1}} -> Customer Name
 * {{2}} -> Order ID
 * {{3}} -> Tracking Number
 * {{4}} -> Tracking Link
 */
export async function sendCustomerShippedWhatsApp(order: Order): Promise<void> {
  const enabled = process.env.ORDER_NOTIFICATIONS_ENABLED === "true";
  if (!enabled) {
    console.log("[WhatsApp Customer] Shipped notifications disabled (ORDER_NOTIFICATIONS_ENABLED !== true)");
    return;
  }

  const token = process.env.WHATSAPP_PERMANENT_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "1222192880967535";

  if (!token) {
    console.error("[WhatsApp Customer] Missing WHATSAPP_PERMANENT_TOKEN env variable");
    return;
  }

  const customerPhone = normalizePhoneNumber(order.customer_phone);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://postduty.in";
  const trackingLink = `${baseUrl}/orders/${order.id}`;

  const payload = {
    messaging_product: "whatsapp",
    to: customerPhone,
    type: "template",
    template: {
      name: "order_shipped",
      language: {
        code: "en_IN",
      },
      components: [
        {
          type: "body",
          parameters: [
            {
              type: "text",
              text: order.customer_name,
            },
            {
              type: "text",
              text: order.id,
            },
            {
              type: "text",
              text: order.tracking_number || "Pending",
            },
            {
              type: "text",
              text: trackingLink,
            },
          ],
        },
      ],
    },
  };

  try {
    const response = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json() as { error?: { code?: number; message?: string } };

    if (!response.ok) {
      // Template may be missing, unapproved, or language-mismatched — fall back to
      // free-form text in all cases so the customer still gets notified.
      console.warn(`[WhatsApp Customer] order_shipped template send failed (status ${response.status}, error code ${data.error?.code}). Falling back to free-form text.`);
      await sendCustomerShippedFallbackText(order, customerPhone, trackingLink);
    } else {
      console.log("[WhatsApp Customer] Shipping template sent successfully. Response:", data);
    }
  } catch (err) {
    console.error("[WhatsApp Customer] Network/Internal error sending customer shipping confirmation:", err);
  }
}

/**
 * Fallback free-form text when the customer shipped template is not yet approved in Meta Business Suite.
 */
async function sendCustomerShippedFallbackText(order: Order, customerPhone: string, trackingLink: string): Promise<void> {
  const token = process.env.WHATSAPP_PERMANENT_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "1222192880967535";
  
  const messageBody = `Hi ${order.customer_name}, your PostDuty order has been shipped! 📦
Order ID: \`${order.id.slice(0, 8).toUpperCase()}\`
Tracking Number: *${order.tracking_number || "Pending"}*

You can track your package details here:
${trackingLink}`;

  try {
    const response = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: customerPhone,
        type: "text",
        text: {
          preview_url: false,
          body: messageBody,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[WhatsApp Customer] Fallback shipping text failed: Status: ${response.status}. Body: ${errText}`);
    } else {
      console.log("[WhatsApp Customer] Fallback shipping text sent successfully.");
    }
  } catch (err) {
    console.error("[WhatsApp Customer] Error sending fallback shipping text:", err);
  }
}

/**
 * Sends a WhatsApp notification to the admin when an order is shipped.
 */
export async function sendAdminShippedWhatsApp(order: Order): Promise<void> {
  const fallbackBody = `📦 *PostDuty Order Shipped!*
Order ID: \`${order.id}\`
Customer: *${order.customer_name}*
Tracking Number: *${order.tracking_number || "None"}*`;

  await sendAdminAlert("Order shipped", order.id, order.customer_name, `Tracking: ${order.tracking_number || "None"}`, fallbackBody);
}

/**
 * Day 1 follow-up: "Did your order reach safely?"
 * Sent 1 day after delivery.
 */
export async function sendFollowUpDay1WhatsApp(order: Order): Promise<void> {
  const enabled = process.env.ORDER_NOTIFICATIONS_ENABLED === "true";
  if (!enabled) return;

  const token = process.env.WHATSAPP_PERMANENT_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return;

  const customerPhone = normalizePhoneNumber(order.customer_phone);

  const messageBody = `Hi ${order.customer_name}! 👋

Your PostDuty order should have reached you by now. We hope you love it! ❤️

If there's any issue at all — wrong item, damaged packaging, anything — just reply here and we'll sort it out immediately.

Thank you for supporting PostDuty! 🙏`;

  try {
    const response = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: customerPhone,
        type: "text",
        text: { preview_url: false, body: messageBody },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[WhatsApp FollowUp Day1] Failed: ${response.status}. ${errText}`);
    } else {
      console.log(`[WhatsApp FollowUp Day1] Sent to ${customerPhone}`);
    }
  } catch (err) {
    console.error("[WhatsApp FollowUp Day1] Error:", err);
  }
}

/**
 * Day 5 follow-up: "How are you liking it? Share a photo for 10% off next order."
 * Sent 5 days after delivery.
 */
export async function sendFollowUpDay5WhatsApp(order: Order): Promise<void> {
  const enabled = process.env.ORDER_NOTIFICATIONS_ENABLED === "true";
  if (!enabled) return;

  const token = process.env.WHATSAPP_PERMANENT_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return;

  const customerPhone = normalizePhoneNumber(order.customer_phone);

  const messageBody = `Hey ${order.customer_name}! 🌟

It's been a few days since your PostDuty order arrived. How are you liking it?

📸 *Share a photo wearing or using your product* and we'll send you a *10% off code* for your next order!

Just reply with a photo right here. We'd love to feature you! 💜`;

  try {
    const response = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: customerPhone,
        type: "text",
        text: { preview_url: false, body: messageBody },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[WhatsApp FollowUp Day5] Failed: ${response.status}. ${errText}`);
    } else {
      console.log(`[WhatsApp FollowUp Day5] Sent to ${customerPhone}`);
    }
  } catch (err) {
    console.error("[WhatsApp FollowUp Day5] Error:", err);
  }
}
