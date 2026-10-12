# Optional Stripe license payment adapter

Select `PAYMENT_PROVIDER=stripe` and configure `STRIPE_SECRET_KEY`, `PAYMENT_SUCCESS_URL`, and `PAYMENT_CANCEL_URL` in the server secret environment. Return URLs must use HTTPS without embedded credentials or fragments. Optional `PAYMENT_PROVIDER_TIMEOUT_MS` defaults to 10,000 and accepts 1–60,000 ms. Production requires an `sk_live_` server key; development/test can use an `sk_test_` key. Unselected production still fails closed. This adapter pins Stripe API version `2025-02-24.acacia`; upgrading that contract requires compatibility testing.

`createCheckout` requires an authenticated user ID supplied by the server, the existing individual ($4 USD) or business ($10 USD) annual-license price, `product: annual-license`, and a UUID `requestId`. The optional plan must agree with the amount. Reuse the same request ID for retries of one purchase attempt. A deterministic account/request idempotency header lets Stripe reject conflicting parameters instead of blindly creating a second session. Stripe retains these keys for a limited window; durable purchase reconciliation is still required after uncertain outcomes or long delays. The adapter does not automatically retry POSTs.

Checkout is hosted on `checkout.stripe.com`, uses a one-time card payment and browser-selected locale, and returns an optional `checkoutUrl` alongside the existing checkout ID/provider reference. The adapter does not charge a stored card, start a subscription, or renew automatically. Only validated Stripe-hosted URLs are returned. The namespaced provider reference is `stripe-checkout:<session-id>`; applications should retain it as the durable payment ledger key.

Verification retrieves the session from the fixed Stripe API origin with its expanded PaymentIntent and latest Charge. It checks session/reference identity, live/test mode, product metadata, account binding, plan price, USD currency, complete/paid session state, succeeded intent, received amount, succeeded/paid/captured charge, intent binding, disputes, and a valid stable charge timestamp. Partial/full refunds return `refunded`, which activation and renewal refuse. Browser redirect flags or callback payloads are not proof of payment. Activation and renewal must share the existing durable payment-application ledger to prevent duplicate terms.

Network calls reject redirects, cookies, malformed/non-JSON responses and JSON over 128 KiB. The entire operation, including response parsing, has one enforced deadline. Ignored cancellation cannot keep callers waiting; late response bodies are released. Provider errors are masked. No file bytes or private attachments are sent to the payment provider, and no API secret or raw card details are exposed by this adapter.

This adds a configured backend adapter, not a complete live billing flow. Authenticated checkout and customer-bound confirmation routes are available; see [billing HTTP API](billing-http-api.md). A verified webhook/reconciliation worker remains pending. Merchant onboarding, credentials, real Stripe sandbox/live checks, deployment, country availability, tax/local-currency configuration, receipts, and refund/dispute-driven revocation after activation remain unfinished. This adapter checks current refunds when verification runs; it does not automatically revoke a previously activated license after a later refund. Synthetic regression tests do not prove real funds settlement or universal country support.

Validation covers checkout parameter encoding, individual/business pricing, request idempotency, trusted expanded verification, shared activation/renewal replay, wrong identity/currency/amount/mode/state, refunds/disputes, arbitrary references and URLs, production configuration, private errors, redirects, oversized JSON, ignored transport cancellation and stalled parsing. No real session, card payment, merchant account or subscription was created during implementation.

Official references:

- [Checkout creation](https://docs.stripe.com/api/checkout/sessions/create?api-version=2025-02-24.acacia)
- [Checkout retrieval](https://docs.stripe.com/api/checkout/sessions/retrieve)
- [PaymentIntent object](https://docs.stripe.com/api/payment_intents/object)
- [Charge object](https://docs.stripe.com/api/charges/object)
- [Idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- [Expanding responses](https://docs.stripe.com/expand)
- [Pinned Acacia release](https://docs.stripe.com/changelog/acacia)
