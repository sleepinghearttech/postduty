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
| Delivered ✓ | Emerald | Customer has received the order. Triggers automatic follow-up messages — see "Delivered status & follow-up messages" below. |

### Important rules

- You **cannot go backward** — once an order is marked Shipped, you cannot change it back to Paid. This is intentional: the badge is a record of what actually happened.
- You **cannot skip steps** — an order must move Pending → Paid → Shipped → Delivered in order. You cannot jump ahead.
- If an order shows **Pending** for more than a few minutes and the customer says they paid, check the Razorpay dashboard. Do not mark it manually unless you can confirm payment there.

---

## Delivered status & follow-up messages

Once you know a package has actually reached the customer (courier confirmation, or the customer tells you), mark it **Delivered**:

1. Go to Orders, find the Shipped order.
2. Click **Mark as delivered ✓**.
3. The badge changes to **Delivered ✓** (emerald) and the delivery timestamp is recorded.

This is more than a label — it starts the automatic follow-up sequence:

| Trigger | Message | Channel |
|---|---|---|
| Delivered + 1 day | "Did your order arrive OK? Any issue, reply here." | WhatsApp + Email |
| Delivered + 5 days | Review ask — "How are you liking it? Share a photo → 10% off next order." | WhatsApp + Email |
| Last order + 60 days, no repeat order | Win-back — "New arrivals + ₹50 off your next order" (code `POSTDUTY50`) | Email only |

These are sent by a daily job (`/api/cron/post-purchase`, protected by `CRON_SECRET`) — **it needs an external scheduler to actually run daily** (e.g. a free cron-job.org account hitting that URL once a day with header `Authorization: Bearer <CRON_SECRET>`). It is not a native Cloudflare Cron Trigger — the current deploy stack (`@opennextjs/cloudflare`) doesn't support wiring one, so `wrangler.jsonc` deliberately has no `crons` block. Set up the external scheduler once and it runs itself; each order is only followed up once per stage (tracked via `followup_day1_sent`/`followup_day5_sent`/`winback_sent` so nothing gets double-sent).

---

## Customer order tracking

Customers can check their own order status without contacting you, at **`/orders`** (e.g. `https://postduty.jijo925.workers.dev/orders`). They enter their Order ID plus the email or phone used at checkout, and see a live status timeline (Paid → Shipped → Delivered) plus the tracking number once you've saved one. Nothing for you to maintain here — it reads the same order data you manage in the admin panel.

---

## Gift orders

At checkout, customers can tick "🎁 Is this a gift? Add a printed greeting card (+₹20)" and optionally write a message. When they do:

- The order total includes the ₹20 gift-card surcharge automatically.
- The order card in Orders shows a **🎁 Gift** badge next to the status badge — hover it to see the gift message, or check the italic note under the order total.
- **Your job**: when packing a gift order, print the gift message on a card and include it in the package before dispatch.

---

## Coupon codes

Manage discount codes at **`/admin/coupons`**.

- **Create a code**: click **+ New coupon**, set the code (e.g. `WELCOME10`), type (**percent** or **flat ₹**), value, an optional minimum order amount, an optional max-uses cap, and an optional expiry date. Codes are case-insensitive at checkout (always stored uppercase).
- **Deactivate a code**: toggle it off instead of deleting — this keeps the usage history intact and stops it working immediately.
- **Starter codes already seeded**: `WELCOME10` (10% off, no minimum, unlimited use), `POSTDUTY50` (₹50 off orders ≥ ₹399, unlimited use — also the win-back code), `INTERN20` (20% off, capped at 50 uses, for soft-launch friends).
- Coupons apply on both the cart checkout and the single-item "Buy Now" checkout. The discount is always re-validated server-side at payment time — a customer can't manipulate the discount by editing the page.

---

## Ambassador referral links

A referral page lives at **`/ref/<code>`** — e.g. `/ref/dr-anil`. Visiting it shows a banner ("You've been referred! Use code DR-ANIL for 10% off") and auto-fills that code into the coupon field at checkout, even if the visitor browses around first (it's remembered in their browser until they check out).

To create one for an ambassador:
1. Go to `/admin/coupons` and create a new coupon as normal (e.g. `code: DR-ANIL`, 10% off).
2. Set the **Referrer code** field to the same value (`dr-anil`, lowercase) — this is what makes `/ref/dr-anil` resolve to this coupon.
3. Give the ambassador their link: `https://postduty.jijo925.workers.dev/ref/dr-anil` (good for a QR code sticker or a bio link).

If the code is deactivated or expired, `/ref/<code>` just redirects to the normal homepage — no broken page, no error shown to the visitor.

---

## Order Notifications

When an order is successfully paid, the system automatically triggers several direct notifications (fully replacing the retired Make.com automation):

1. **Admin WhatsApp Alert**: sent to the configured admin number (`ADMIN_WHATSAPP_NUMBER`) via the `admin_order_alert` template (pending Meta approval as of writing) with the order details, falling back to a free-form text message if the template isn't available. Note: free-form WhatsApp text only delivers if you've messaged the business number within the last 24h (Meta's session-window rule) — the template exists specifically so this notification doesn't depend on that.
2. **Customer WhatsApp Confirmation**: a template-based message using the approved `order_confirmation` template is sent to the customer's phone number via WhatsApp API (v25.0).
3. **Admin Email Alert**: a detailed email is sent to `postdutyswag@gmail.com` containing the full order summary.
4. **Customer Email Confirmation**: a friendly email is sent to the customer confirming their order and total amount.

**When you mark an order Shipped**, two more notifications fire automatically: a WhatsApp + email to the customer with the tracking number (WhatsApp uses the `order_shipped` template if approved, otherwise falls back to free-form text), and a WhatsApp alert to you confirming it went out.

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

