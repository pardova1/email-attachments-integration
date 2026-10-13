# Authenticated billing HTTP API

The server mounts two JSON endpoints under `/v1/billing`. Both require a sender Bearer token verified by the configured authenticator. Identity comes from authentication, not JSON, cookies or query strings. Responses use `Cache-Control: no-store` and mask private provider errors. These APIs create/confirm payments; they do not expose card data or Stripe server credentials.

## Start checkout

`POST /v1/billing/checkout`

```json
{"plan":"individual","requestId":"b0a5d788-8c9b-4efe-bb55-2f171c9f843e"}
```

`plan` is `individual` or `business`; the server computes the existing annual-license price. `requestId` is a UUID for one purchase attempt and must be reused for retries. Extra fields, supplied prices, user identities and paid flags are rejected. A successful response is HTTP 201 with `checkoutId`, namespaced `providerReference`, and the provider's validated hosted `checkoutUrl` when available. Open the returned URL for the customer's explicit payment action. A checkout session does not establish an entitlement.

## Confirm payment

`POST /v1/billing/confirm-payment`

```json
{"providerReference":"stripe-checkout:cs_live_example"}
```

The server re-fetches payment evidence through the provider. The verified reference must match the submitted reference, and the verified user must match the authenticated caller. These checks precede any license application. Unpaid, refunded, disputed, malformed, foreign-customer or mismatched evidence cannot activate a license. Success returns HTTP 200 with only the caller's license plan, start/expiration timestamps, amount and status.

The existing payment application ledger grants one term per distinct payment reference. Repeated confirmation returns current license state without another term. A distinct valid payment extends the existing license; initial purchases and renewals use the same durable ledger. A payment mismatch returns generic HTTP 409 `PAYMENT_CONFIRMATION_REJECTED` without exposing another customer's identity or license.

An embeddable host-session browser panel is available; see [browser billing](browser-billing.md).

## Request controls

Set `BILLING_ALLOWED_ORIGINS` to comma-separated exact HTTPS origins for browser callers, including the app origin for a same-origin deployment. Origin-bearing requests outside this list are rejected. Originless native/server requests still require Bearer authentication. No browser origins are allowed by default. This allowlist does not add cross-origin CORS support; use a same-origin deployment or a separately reviewed CORS setup.

Billing shares the configured `CONNECTION_MAX_ACTIVE_TOTAL` and `CONNECTION_MAX_ACTIVE_PER_CUSTOMER` settings, snapshotted when its router is mounted. Billing's budget is independent of connection/transfer budgets and applies jointly to its two endpoints per server instance. Default limits are 100 total and one active request per customer. Busy requests receive HTTP 503 `BILLING_BUSY` without starting provider work.

The router has a 30-second deadline by default (its composition accepts 1–120,000 ms), propagates cancellation to authentication, and rechecks timeout/disconnection after provider verification immediately before the ledger call. A late verification cannot start a license application. An already-started provider checkout or database transaction cannot be undone by disconnecting; retry/reconcile using the same request ID/reference. Provider calls have their own bounded deadline and do not automatically retry. Response timers/listeners are released on completion, failure, timeout or disconnect. An acquired capacity slot is released only when the underlying provider/ledger operation settles. A timed-out or disconnected request therefore continues to count against both limits while its work is outstanding; retries receive `BILLING_BUSY` without starting another provider operation. Authentication before admission is outside this budget. A dependency that never settles keeps its slot until the server restarts; production dependencies must retain their own bounded deadlines.

Missing/invalid authentication returns 401. Non-JSON requests return 415. Invalid strict JSON returns 400. Untrusted origins return 403. Provider/dependency failures return generic 503 `BILLING_UNAVAILABLE`. Malformed JSON is handled by the server's existing Express JSON parser.

Regression tests exercise actual local HTTP requests for account/price derivation, payment ownership, replay protection, failed/refunded/mismatched evidence, input/origin checks, timeout/disconnect before application, capacity rejection/release and private errors. Production credentials, live Stripe validation, webhook provisioning/backlog reconciliation, later refund/dispute revocation, UI wiring, deployment and worldwide testing remain unfinished. No real customer payment was created by these tests.
