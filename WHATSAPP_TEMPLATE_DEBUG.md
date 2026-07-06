# WhatsApp custom-template delivery bug — diagnostic checklist

**Confirmed fact (2026-07-06):** the `hello_world` test template delivers successfully through the current setup. Only the **custom order-notification template** fails silently (Make.com shows green execution ticks, no message arrives).

Because `hello_world` works, these are **ruled out** — they'd block `hello_world` too:
- ~~Recipient not in test-recipient allowlist~~ (Meta dev-mode restriction)
- ~~No payment method on the WABA~~ (billing)
- ~~Token/Phone-Number-ID misconfigured~~

That narrows the bug to something specific to the **custom template itself** or **how Make.com sends it**. Check in this order:

## 1. Template approval status
In **WhatsApp Manager → Message Templates**, find the custom order-notification template.
- Status must read **Approved** (not "Pending" or "Rejected"). A pending/rejected template silently fails to send even though the API call can return 200 — Meta accepts the request but never delivers.
- If rejected: read the rejection reason (usually generic wording flagged as promotional, or missing required variable format) and resubmit.

## 2. Language code exact match
Every approved template has a `language.code` (e.g. `en`, `en_US`).
- In WhatsApp Manager, note the **exact** code shown for this template.
- In the Make.com HTTP request body, the `template.language.code` field must match **exactly** — `en` and `en_US` are different templates to the API and a mismatch fails silently.
- Fix: either change the Make.com payload to match the approved code, or re-check which language variant was actually approved.

## 3. Template name match
- Confirm the `template.name` string in the Make.com payload is byte-identical to the template's name in WhatsApp Manager (case-sensitive, no extra spaces). A typo here also fails silently rather than erroring loudly.

## 4. Variable/parameter count and order
- Open the approved template in WhatsApp Manager and count the `{{1}}`, `{{2}}`, ... placeholders it defines.
- In the Make.com HTTP body's `components[0].parameters` array, the number of parameters must match exactly, in the same order the template defines them (e.g. if the template is "Hi {{1}}, your order {{2}} has shipped", parameters must be `[customer_name, order_id]` in that order).
- A mismatch (too few/many parameters, or wrong order) is one of the most common silent-failure causes.

## 5. Confirm via the message status API (fastest way to get a real answer)
Rather than guessing from Make.com's UI, look up the actual delivery status:
1. From the API response for a template send, grab the returned `messages[0].id`.
2. Either register a webhook for message status callbacks (`sent`/`delivered`/`failed`, with an `errors[]` array containing the real reason code), or query Meta's Graph API conversation/message endpoints for that message ID.
3. The `errors[]` array on a failed status callback will name the exact problem (e.g. `132000` template does not exist, `132001` template param count mismatch, `131047` re-engagement window) — this replaces steps 1-4 above with a definitive answer instead of a checklist.

**Recommended order:** do step 5 first if a webhook is already reachable (fastest, gives the exact error code) — otherwise work steps 1→4 in order, since template-approval and language-code mismatches are the two most common causes of "green tick, no message" for a custom template specifically.
