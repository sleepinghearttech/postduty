# PostDuty n8n Workflow

> [!WARNING]
> **RETIRED**: Both the Make.com automation and the n8n workflows are **fully retired**.
> All order notifications are now triggered directly from our Next.js server via API calls for maximum control, speed, and reliability.
> - WhatsApp Alerts: [notifications.ts](file:///d:/Business%20plan/PostDuty/postduty/src/lib/notifications.ts)
> - Email Alerts: [email.ts](file:///d:/Business%20plan/PostDuty/postduty/src/lib/email.ts)
> 
> This folder is kept purely as an archival reference.

Automated order notification pipeline. Fires when a new paid order is inserted into Supabase, then sends a WhatsApp message, an email, and logs a row to Google Sheets.

## How to import

1. Open n8n (http://localhost:5678 or your cloud instance)
2. Click **+** → **Import from file**
3. Select `n8n/postduty-order-notification.json` from this repo

## Credentials to re-enter after import

Credentials are **not** stored in the exported JSON — only references to credential names. You must re-create each one:

| Node | Credential type | What to enter |
|------|----------------|---------------|
| HTTP Request (WhatsApp) | Header Auth | Header: `Authorization`, Value: `Bearer <token>` — get from Meta Developer Console → WhatsApp → API Setup |
| Gmail | OAuth2 | Sign in to `jijo925@gmail.com` via Google OAuth popup |
| Google Sheets | OAuth2 | Same Google account — reuse the Gmail credential if n8n allows |

## WhatsApp token expiry

The token from Meta Developer Console expires in **60 days**. Before it expires, replace it with a permanent System User token:

1. Meta Business Suite → Users → System Users → Create system user
2. Assign permissions: `whatsapp_business_messaging`
3. Generate token → update the n8n Header Auth credential

## Updating the Supabase webhook URL

If n8n moves to a new server (or you switch from ngrok to a cloud instance):

1. Get the new webhook URL from n8n: open the workflow → click the Webhook node → copy URL
2. Go to Supabase dashboard → Database → Webhooks → find `order-notification` → edit → paste new URL

## Triggering during local dev

n8n running locally (`localhost:5678`) is not reachable by Supabase. Use ngrok to expose it:

```bash
ngrok http 5678
```

Copy the HTTPS URL (e.g. `https://abc123.ngrok.io`), append `/webhook/postduty-order`, and paste into the Supabase webhook URL field.
