# PostDuty Admin Guide

This guide is for managing products on PostDuty. No coding knowledge needed.

---

## How to log in

1. Go to: **https://postduty.jijo925.workers.dev/admin/products**
2. You will be redirected to a password screen automatically.
3. Enter the admin password (Jijo will share this with you).
4. Click **Log in**.
5. You will stay logged in for 7 days. After that, you will be asked to log in again.

---

## How to add a new product

1. On the products page, click **+ Add new product** (the dashed button at the top).
2. Fill in:
   - **Product name** — e.g. "Stethoscope Keychain"
   - **Price (₹)** — enter in rupees, e.g. 249
   - **Stock quantity** — how many units you have
   - **Description** — what the customer will see on the product page
3. Click **Create product**.
4. The product is saved as **Inactive** — it will NOT appear on the website yet. This is intentional so you can upload an image and review everything before making it live.

---

## How to upload an image

After creating a product (or to update an existing one):

1. Find the product card on the page.
2. On the left side of the card, you will see a grey image box.
3. **Option A — Drag and drop:** Open the folder on your computer where the image is saved. Drag the image file and drop it onto the grey box.
4. **Option B — Click to browse:** Click the grey box. A file picker will open. Select your image.
5. **Option C — Paste a URL:** If the image is already on the internet (e.g. a supplier's website), paste the image link into the small text box below the image area and click **Use URL**.
6. The image uploads automatically. You will see it appear in the box.

Accepted formats: JPG, PNG, WebP, GIF.

---

## How to activate a product (make it visible on the website)

1. Find the product card.
2. At the bottom of the card, you will see a button that says **Inactive — hidden from site**.
3. Click it. It will turn green and say **Active — visible on site**.
4. The product is now live on the website. No other steps needed.

To hide a product again, click the same button and it will go back to Inactive.

---

## How to edit a product

All fields on a product card are editable:

1. Click on the name, price, stock, or description to edit it directly.
2. When you make a change, a **Save changes** button will appear at the bottom right of the card.
3. Click **Save changes**.
4. Done. The website will show the updated information immediately.

The **price** field is always in rupees (₹). Enter whole numbers or decimals (e.g. 199 or 249.50).

---

## How to deactivate a product (hide it without deleting)

Click the green **Active — visible on site** button at the bottom of the card. It will turn grey and the product will disappear from the website. The product is not deleted — you can reactivate it any time.

Use this when a product is out of stock or needs to be updated before customers see it.

---

## How to delete a product

1. Click the **Delete** button at the bottom right of the card.
2. A confirmation message will appear. Click OK to confirm.
3. The product is permanently removed.

**Important:** If a customer has already ordered this product in the past, you will NOT be able to delete it. This is to protect the order records. Instead, set it to Inactive to hide it from the website.

---

## Tips

- New products are always created as Inactive first. This means you can set everything up (image, price, description) before customers see it.
- Changes to price, stock, or description take effect immediately after you click Save — no waiting.
- If you are not sure about a product, leave it Inactive until you are ready.
- If you close the browser, you will still be logged in when you come back (for up to 7 days).

---

## How to process an order (when a customer buys)

When a customer completes a payment, their order appears automatically in the Orders section. Here is what to do, step by step.

### Step 1 — See the new order

1. Log in to the admin panel.
2. Click **Orders** in the top navigation bar.
3. New paid orders arrive with a **Paid — ready to ship** badge (blue). This means the customer's payment was confirmed by Razorpay. You can trust it.

### Step 2 — Pack the item

Pack the product as per your process. The order card shows you:
- The customer's full name, email, and phone number
- The exact shipping address to write on the package
- Which product and quantity was ordered

### Step 3 — Create the shipment in Shiprocket

1. Log in to your Shiprocket account at shiprocket.in.
2. Create a new shipment. Enter the customer's details (name, address, phone) and the product weight/dimensions.
3. Confirm the shipment. Shiprocket will assign a **tracking number** (also called AWB number — it looks like a series of numbers, e.g. `1234567890`).

### Step 4 — Mark the order as shipped in PostDuty

1. Go back to the PostDuty admin panel → Orders.
2. Find the order.
3. Click the green **Mark as shipped ↗** button.
4. The badge changes to **Shipped** (green). A tracking number field appears below the order.

### Step 5 — Save the tracking number

1. Copy the tracking number (AWB) from Shiprocket.
2. Paste it into the tracking number field on the order card.
3. Click **Save tracking** (or press Enter).
4. Done. The tracking number is saved against the order.

### Understanding the status badges

| Badge | Colour | What it means |
|-------|--------|---------------|
| Pending | Yellow | Payment not fully confirmed (rare — usually resolves automatically) |
| Paid — ready to ship | Blue | Payment confirmed. Pack and ship this order. |
| Shipped | Green | Order has been handed to the courier. |

### Important rules

- You **cannot go backward** — once an order is marked Shipped, you cannot change it back to Paid. This is intentional: the badge is a record of what actually happened.
- You **cannot skip steps** — an order must move Paid → Shipped in order. You cannot jump from Pending to Shipped.
- If an order shows **Pending** for more than a few minutes and the customer says they paid, check the Razorpay dashboard. Do not mark it manually unless you can confirm payment there.

---

## Order Notifications

When an order is successfully paid, the system automatically triggers several direct notifications (fully replacing the retired Make.com automation):

1. **Admin WhatsApp Alert**: A free-form WhatsApp message is sent to the configured admin number (`ADMIN_WHATSAPP_NUMBER`) with the order details and shipping address.
2. **Customer WhatsApp Confirmation**: A template-based message using the approved `order_confirmation` template is sent to the customer's phone number via WhatsApp API (v25.0).
3. **Admin Email Alert**: A detailed email is sent to `postdutyswag@gmail.com` containing the full order summary.
4. **Customer Email Confirmation**: A friendly email is sent to the customer confirming their order and total amount.

### Notification Configuration & Maintenance
All configurations are done in code, allowing 100% control and reliability:
- **WhatsApp API / Template Parameters**: Handled in [notifications.ts](file:///d:/Business%20plan/PostDuty/postduty/src/lib/notifications.ts).
- **Email Copy / Layout**: Handled in [email.ts](file:///d:/Business%20plan/PostDuty/postduty/src/lib/email.ts).

### Troubleshooting Notifications
If a notification is not received:
1. Verify `ORDER_NOTIFICATIONS_ENABLED` is set to `true` in your `.env.local` or Cloudflare dashboard.
2. Ensure the required environment variables are set and correct:
   - `WHATSAPP_PERMANENT_TOKEN` (Meta system user token)
   - `WHATSAPP_PHONE_NUMBER_ID` (Phone number ID, e.g., `1222192880967535`)
   - `ADMIN_WHATSAPP_NUMBER` (Admin phone number, e.g. `918903885758`)
   - `RESEND_API_KEY` (Resend API Key)
3. Check application logs in Cloudflare. If the WhatsApp template fails, Meta's API response will indicate the exact structural mismatch (e.g. parameter mismatch).
4. Check if the customer's phone number is correctly formatted. The code automatically normalizes standard 10-digit Indian numbers and numbers starting with `0`.

