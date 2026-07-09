import { Order } from "@/lib/types";

/**
 * Sends order notification emails using Resend's API.
 * Sends one email to the admin (postdutyswag@gmail.com) and another to the customer.
 * 
 * NOTE: For production, Resend requires a verified sending domain.
 * Currently, we use Resend's shared sandbox domain (onboarding@resend.dev).
 * Under the sandbox domain, Resend will only deliver emails to the account owner
 * (the email address used to register the Resend account).
 */
export async function sendOrderEmails(order: Order): Promise<void> {
  const enabled = process.env.ORDER_NOTIFICATIONS_ENABLED === "true";
  if (!enabled) {
    console.log("[Email] Order notifications are disabled (ORDER_NOTIFICATIONS_ENABLED !== true)");
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[Email] RESEND_API_KEY environment variable is not defined");
    return;
  }

  const amountInRupees = (order.total_amount / 100).toFixed(2);
  const fromEmail = "PostDuty <onboarding@resend.dev>";
  
  // 1. Admin email details
  const adminEmailPayload = {
    from: fromEmail,
    to: ["postdutyswag@gmail.com"],
    subject: `New PostDuty Order — ₹${amountInRupees}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 8px;">
        <h2 style="color: #6366f1; border-bottom: 2px solid #f3f4f6; padding-bottom: 10px;">New Order Received!</h2>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 8px 0; font-weight: bold; width: 150px;">Order ID:</td>
            <td style="padding: 8px 0;">${order.id}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold;">Amount:</td>
            <td style="padding: 8px 0; font-size: 1.1em; color: #10b981; font-weight: bold;">₹${amountInRupees}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold;">Customer Name:</td>
            <td style="padding: 8px 0;">${order.customer_name}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold;">Customer Email:</td>
            <td style="padding: 8px 0;"><a href="mailto:${order.customer_email}">${order.customer_email}</a></td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold;">Customer Phone:</td>
            <td style="padding: 8px 0;">${order.customer_phone}</td>
          </tr>
        </table>
        
        <div style="background-color: #f9fafb; padding: 15px; border-radius: 6px; border-left: 4px solid #6366f1; margin-top: 20px;">
          <h3 style="margin-top: 0; color: #374151;">Shipping Address:</h3>
          <p style="margin: 0; white-space: pre-wrap;">${order.shipping_address}</p>
        </div>

        <div style="margin-top: 30px; font-size: 0.85em; color: #6b7280; text-align: center; border-top: 1px solid #f3f4f6; padding-top: 15px;">
          PostDuty Storefront Admin Notification
        </div>
      </div>
    `
  };

  // 2. Customer email details
  const customerEmailPayload = {
    from: fromEmail,
    to: [order.customer_email],
    subject: "Your PostDuty order is confirmed",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #6366f1; margin-bottom: 5px;">PostDuty</h1>
          <p style="color: #6b7280; margin-top: 0; font-style: italic;">Gifts for Healthcare Heroes</p>
        </div>
        
        <h2 style="color: #111827; border-bottom: 1px solid #f3f4f6; padding-bottom: 10px;">Order Confirmed!</h2>
        
        <p>Hi ${order.customer_name},</p>
        <p>Thank you for shopping with PostDuty! We've received your order and are getting it ready to ship.</p>
        
        <div style="background-color: #f9fafb; padding: 15px; border-radius: 6px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #374151; font-size: 1rem;">Order Summary</h3>
          <p style="margin: 5px 0;"><strong>Order ID:</strong> <span style="font-family: monospace;">${order.id}</span></p>
          <p style="margin: 5px 0;"><strong>Amount Paid:</strong> ₹${amountInRupees}</p>
        </div>
        
        <p>Once your order ships, we'll send you another update with your courier tracking details so you can follow its journey.</p>
        
        <p>If you have any questions or need to make changes to your shipping details, feel free to reply to this email or reach out to us at <a href="mailto:postdutyswag@gmail.com">postdutyswag@gmail.com</a>.</p>
        
        <p style="margin-top: 30px;">Best regards,<br><strong>The PostDuty Team</strong></p>
        
        <div style="margin-top: 40px; font-size: 0.8em; color: #9ca3af; text-align: center; border-top: 1px solid #f3f4f6; padding-top: 15px;">
          PostDuty Storefront · postdutyswag@gmail.com
        </div>
      </div>
    `
  };

  // Helper to send a single email
  const sendEmailRequest = async (payload: typeof adminEmailPayload, label: string) => {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Email] Failed to send ${label} email. Status: ${response.status}. Error: ${errorText}`);
      } else {
        const data = await response.json();
        console.log(`[Email] ${label} email sent successfully. ID:`, (data as { id: string })?.id);
      }
    } catch (err) {
      console.error(`[Email] Error sending ${label} email:`, err);
    }
  };

  // Trigger both emails in parallel without throwing errors
  await Promise.all([
    sendEmailRequest(adminEmailPayload, "Admin"),
    sendEmailRequest(customerEmailPayload, "Customer")
  ]);
}

/**
 * Sends a shipping confirmation email to the customer when the order is marked shipped.
 */
export async function sendCustomerShippingEmail(order: Order): Promise<void> {
  const enabled = process.env.ORDER_NOTIFICATIONS_ENABLED === "true";
  if (!enabled) {
    console.log("[Email] Shipping notifications are disabled (ORDER_NOTIFICATIONS_ENABLED !== true)");
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[Email] RESEND_API_KEY environment variable is not defined");
    return;
  }

  const amountInRupees = (order.total_amount / 100).toFixed(2);
  const fromEmail = "PostDuty <onboarding@resend.dev>";
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://postduty.in";
  const trackingLink = `${baseUrl}/orders/${order.id}`;

  const payload = {
    from: fromEmail,
    to: [order.customer_email],
    subject: `Your PostDuty order has shipped! 📦`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #6366f1; margin-bottom: 5px;">PostDuty</h1>
          <p style="color: #6b7280; margin-top: 0; font-style: italic;">Gifts for Healthcare Heroes</p>
        </div>
        
        <h2 style="color: #111827; border-bottom: 1px solid #f3f4f6; padding-bottom: 10px;">Order Dispatched!</h2>
        
        <p>Hi ${order.customer_name},</p>
        <p>Great news! Your PostDuty order is on its way. We have handed it over to our courier partner.</p>
        
        <div style="background-color: #f9fafb; padding: 15px; border-radius: 6px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #374151; font-size: 1rem;">Tracking Details</h3>
          <p style="margin: 5px 0;"><strong>Order ID:</strong> <span style="font-family: monospace;">${order.id}</span></p>
          <p style="margin: 5px 0;"><strong>AWB Tracking Number:</strong> <span style="font-weight: bold; color: #6366f1;">${order.tracking_number || "Pending"}</span></p>
          <p style="margin: 15px 0 5px 0;">
            <a href="${trackingLink}" style="display: inline-block; background-color: #6366f1; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 0.9em;">
              Track Order on PostDuty
            </a>
          </p>
        </div>
        
        <p>Deliveries typically take between **3 to 7 business days** to arrive depending on your city. You can use the link above to monitor your status.</p>
        
        <p>If you have any questions, reply to this email or contact us at <a href="mailto:postdutyswag@gmail.com">postdutyswag@gmail.com</a>.</p>
        
        <p style="margin-top: 30px;">Best regards,<br><strong>The PostDuty Team</strong></p>
        
        <div style="margin-top: 40px; font-size: 0.8em; color: #9ca3af; text-align: center; border-top: 1px solid #f3f4f6; padding-top: 15px;">
          PostDuty Storefront · postdutyswag@gmail.com
        </div>
      </div>
    `
  };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Email] Failed to send customer shipping email. Status: ${response.status}. Error: ${errorText}`);
    } else {
      const data = await response.json();
      console.log(`[Email] Customer shipping email sent successfully. ID:`, (data as { id: string })?.id);
    }
  } catch (err) {
    console.error(`[Email] Error sending customer shipping email:`, err);
  }
}

/**
 * Day 1 post-delivery: "Your order reached safely?"
 */
export async function sendFollowUpDay1Email(order: Order): Promise<void> {
  const enabled = process.env.ORDER_NOTIFICATIONS_ENABLED === "true";
  if (!enabled) return;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const fromEmail = "PostDuty <onboarding@resend.dev>";

  const payload = {
    from: fromEmail,
    to: [order.customer_email],
    subject: "Did your PostDuty order arrive safely? 📦",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #6366f1; margin-bottom: 5px;">PostDuty</h1>
          <p style="color: #6b7280; margin-top: 0; font-style: italic;">Gifts for Healthcare Heroes</p>
        </div>
        
        <h2 style="color: #111827;">Hey ${order.customer_name}! 👋</h2>
        
        <p>Your PostDuty order should have reached you by now. We hope you love it!</p>
        
        <p>If there's any issue at all — wrong item, damaged packaging, anything — just reply to this email and we'll sort it out immediately. No questions asked.</p>
        
        <p>Thank you for supporting PostDuty! 🙏</p>
        
        <p style="margin-top: 30px;">Best regards,<br><strong>The PostDuty Team</strong></p>
        
        <div style="margin-top: 40px; font-size: 0.8em; color: #9ca3af; text-align: center; border-top: 1px solid #f3f4f6; padding-top: 15px;">
          PostDuty Storefront · postdutyswag@gmail.com
        </div>
      </div>
    `,
  };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(`[Email] FollowUp Day1 failed: ${response.status}`);
    } else {
      console.log("[Email] FollowUp Day1 sent to", order.customer_email);
    }
  } catch (err) {
    console.error("[Email] FollowUp Day1 error:", err);
  }
}

/**
 * Day 5 post-delivery: "Share a photo → get 10% off next order"
 */
export async function sendFollowUpDay5Email(order: Order): Promise<void> {
  const enabled = process.env.ORDER_NOTIFICATIONS_ENABLED === "true";
  if (!enabled) return;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const fromEmail = "PostDuty <onboarding@resend.dev>";

  const payload = {
    from: fromEmail,
    to: [order.customer_email],
    subject: "Share a photo & get 10% off your next PostDuty order! 📸",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #6366f1; margin-bottom: 5px;">PostDuty</h1>
          <p style="color: #6b7280; margin-top: 0; font-style: italic;">Gifts for Healthcare Heroes</p>
        </div>
        
        <h2 style="color: #111827;">How are you liking it? 🌟</h2>
        
        <p>Hey ${order.customer_name},</p>
        
        <p>It's been a few days since your PostDuty order arrived. We'd love to know how you're liking it!</p>
        
        <div style="background: linear-gradient(135deg, #e0e7ff, #f5f3ff); padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
          <p style="font-size: 1.1em; font-weight: bold; color: #4f46e5; margin: 0;">📸 Share a photo wearing or using your product</p>
          <p style="color: #6366f1; margin: 10px 0 0;">and we'll send you a <strong>10% off code</strong> for your next order!</p>
        </div>
        
        <p>Just reply to this email with a photo. We'd love to feature you on our Instagram! 💜</p>
        
        <p style="margin-top: 30px;">Best regards,<br><strong>The PostDuty Team</strong></p>
        
        <div style="margin-top: 40px; font-size: 0.8em; color: #9ca3af; text-align: center; border-top: 1px solid #f3f4f6; padding-top: 15px;">
          PostDuty Storefront · postdutyswag@gmail.com
        </div>
      </div>
    `,
  };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(`[Email] FollowUp Day5 failed: ${response.status}`);
    } else {
      console.log("[Email] FollowUp Day5 sent to", order.customer_email);
    }
  } catch (err) {
    console.error("[Email] FollowUp Day5 error:", err);
  }
}

/**
 * 60-day win-back: "We've added new arrivals! Here's ₹50 off"
 */
export async function sendWinBackEmail(order: Order, couponCode: string): Promise<void> {
  const enabled = process.env.ORDER_NOTIFICATIONS_ENABLED === "true";
  if (!enabled) return;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const fromEmail = "PostDuty <onboarding@resend.dev>";
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://postduty.in";

  const payload = {
    from: fromEmail,
    to: [order.customer_email],
    subject: "We miss you! Here's ₹50 off your next PostDuty order 💜",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #6366f1; margin-bottom: 5px;">PostDuty</h1>
          <p style="color: #6b7280; margin-top: 0; font-style: italic;">Gifts for Healthcare Heroes</p>
        </div>
        
        <h2 style="color: #111827;">We've added new arrivals! 🎉</h2>
        
        <p>Hey ${order.customer_name},</p>
        
        <p>It's been a while since your last PostDuty order. We've been busy adding new products that your healthcare friends will love!</p>
        
        <div style="background: linear-gradient(135deg, #dcfce7, #f0fdf4); padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center; border: 1px solid #86efac;">
          <p style="font-size: 0.9em; color: #166534; margin: 0;">Your exclusive code:</p>
          <p style="font-size: 1.5em; font-weight: bold; color: #166534; margin: 8px 0; font-family: monospace; letter-spacing: 3px;">${couponCode}</p>
          <p style="color: #166534; margin: 0;">₹50 off your next order</p>
        </div>
        
        <p style="text-align: center;">
          <a href="${baseUrl}" style="display: inline-block; background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Shop New Arrivals →
          </a>
        </p>
        
        <p style="margin-top: 30px;">Best regards,<br><strong>The PostDuty Team</strong></p>
        
        <div style="margin-top: 40px; font-size: 0.8em; color: #9ca3af; text-align: center; border-top: 1px solid #f3f4f6; padding-top: 15px;">
          PostDuty Storefront · postdutyswag@gmail.com
        </div>
      </div>
    `,
  };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(`[Email] WinBack failed: ${response.status}`);
    } else {
      console.log("[Email] WinBack sent to", order.customer_email);
    }
  } catch (err) {
    console.error("[Email] WinBack error:", err);
  }
}
