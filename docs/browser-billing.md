# Host-session billing panel

For mounting billing and connection assistance together with a fresh send preflight, see [combined sender account](sender-account-component.md).

The existing standalone browser bundle, `dist/browser/connection-assistance.js`, now exports `BillingClient`, `BillingClientError`, `mountSessionBilling`, and `BILLING_LABELS` alongside connection assistance. It contains no server secrets or Node imports. This is an embeddable component for the application's signed-in host, not a new hosted application or login screen.

```ts
import {mountSessionBilling} from "/assets/connection-assistance.js";
const panel = mountSessionBilling(document.querySelector("#billing"), session, {
  apiBase: "https://your-app.example/v1/billing",
  onConfirmed(license) { refreshAccountFromServer(); }
});
// On host teardown:
panel.dispose();
```

`session` implements the same `ConnectionApplicationSession` contract as connection assistance: `currentCustomer()` returns the current account ID, `accessToken(signal)` supplies its current sender Bearer token, and `subscribe(changed)` promptly reports login/logout/account changes and returns an unsubscribe function. The host must ensure tokens belong to the current account. The panel rechecks account scope around token retrieval and responses, cancels pending work on account changes, and removes old checkout links and purchase state. Tokens, purchase references, and results are held in memory only; they are not placed in URLs, cookies, local storage, or session storage. Reloading clears purchase state. Saved license status is loaded from the authenticated server on mount and account changes; fulfillment still depends on the configured webhook and provider reconciliation.

The **Your licenses** list shows each saved plan, its active/inactive snapshot, expiration and check time. **Refresh licenses** reads current stored status without creating checkout or verifying a payment with Stripe. Reads occur automatically on mount and account changes by default; hosts can set `autoLoadStatus: false` and call `refreshStatus()` explicitly. `initialStatus` is a promise for the initial load. An unavailable read is presented as unknown/unavailable, not “no licenses.” Status reads never invoke `onConfirmed`. Client validation rejects duplicate plans, private fields, inconsistent active flags/prices/dates, and check times more than five minutes old or over one minute in the future. The host and server clocks should be synchronized. This snapshot does not automatically reconcile refunds or act as a transfer authorization.

The panel displays the existing Individual $4 USD and Business $10 USD annual prices from the shared plan module. The backend derives the actual price and customer; no client price or identity is sent in JSON. Checkout starts only on an explicit action and opens through an explicit link to the validated `https://checkout.stripe.com` origin, with no opener or referrer. No redirect occurs automatically. A return URL, checkout creation, client-side paid flag, or link click cannot confirm payment.

For one purchase attempt, retries use the same generated UUID. After a failed or uncertain checkout, the plan stays locked until the customer explicitly starts another purchase. Do not start another purchase if a previous payment may already have completed; reconcile that purchase first. The panel sends no automatic retry or charge. The customer uses **Check payment** to invoke authenticated server confirmation. Only a validated confirmation response reaches `onConfirmed`; the host must continue using server-side entitlement/send checks to authorize transfers. A confirmation callback is not a permanent authorization cache. Expired licenses are displayed as expired.

The API base must be a trusted configured HTTPS URL ending in `/v1/billing`, without credentials, query, or fragment. Deploy the browser and API on the same origin and include that origin in `BILLING_ALLOWED_ORIGINS`; these components do not configure CORS. Requests omit cookies, disallow redirects, use `no-store`, and acquire a fresh host token each time. Client operations have a 40-second default deadline including token acquisition, transport, and body reading (configurable 1–120,000 ms). Responses must be JSON and are limited to 16 KiB. Server details are replaced with fixed public messages. Timeout or disconnect cannot undo a provider payment or already-started ledger transaction.

The panel uses semantic controls, text-only labels, an `aria-live` status, and `aria-busy` state. Host styling supplies layout. For localization, pass a complete `labels` object with the same keys as `BILLING_LABELS`, plus `language` and optional `direction: "rtl"`. Default labels are English. This addition does not claim translated payment controls for every country or universal provider availability.

Live merchant credentials and endpoint provisioning, the host's login/payment-page wiring and asset serving, real provider testing, receipts, later refund/dispute revocation, durable backlog reconciliation, deployment, and country testing remain required. Tests use synthetic checkout/payment evidence; no real session, charge, or external provider request is created.
