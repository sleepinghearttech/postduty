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
 * Sends a free-form WhatsApp alert to the ADMIN_WHATSAPP_NUMBER.
 * Note: Free-form messages are sent as type: text.
 */
export async function sendAdminWhatsAppAlert(order: Order): Promise<void> {
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
  const amountInRupees = formatRupees(order.total_amount);

  const messageBody = `🚨 *New PostDuty Order!*
Order ID: \`${order.id}\`
Customer: *${order.customer_name}*
Email: ${order.customer_email}
Phone: ${order.customer_phone}
Amount: *${amountInRupees}*

*Shipping Address:*
${order.shipping_address}`;

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
      console.log("[WhatsApp Admin] Alert sent successfully. Response:", data);
    }
  } catch (err) {
    console.error("[WhatsApp Admin] Network/Internal error sending admin alert:", err);
  }
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
   * Language: en_US
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
        code: "en_US",
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
