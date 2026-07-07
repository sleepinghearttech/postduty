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
        
        <p>If you have any questions or need to make changes to your shipping details, feel free to reply to this email or reach out to us at <a href="mailto:hello@postduty.in">hello@postduty.in</a>.</p>
        
        <p style="margin-top: 30px;">Best regards,<br><strong>The PostDuty Team</strong></p>
        
        <div style="margin-top: 40px; font-size: 0.8em; color: #9ca3af; text-align: center; border-top: 1px solid #f3f4f6; padding-top: 15px;">
          PostDuty Storefront · hello@postduty.in
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
