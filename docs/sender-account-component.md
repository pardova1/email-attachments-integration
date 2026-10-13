# Combined signed-in sender account

The host can continue a successful preflight through the [browser transfer-creation client](browser-transfer-creation.md).

The standalone `connection-assistance.js` browser bundle exports `mountSenderAccount` to mount billing and connection assistance under one host account. The existing panels can still be used individually. This component supplies no login form, hosting, composer hook, file picker, upload transport or mail sending.

```ts
import {mountSenderAccount} from "/assets/connection-assistance.js";
const account = mountSenderAccount(document.querySelector("#sender-account"), session, {
  apiOrigin: "https://your-app.example",
  connection: {language: "en"},
  billing: {language: "en"}
});

// Inside the host's attachment/send action:
if (await account.checkBeforeSending()) {
  // Continue through the authenticated transfer-creation API.
  // That API independently validates account, license and connection readiness.
}

// On host teardown:
account.dispose();
```

`session` implements `ConnectionApplicationSession`: current account ID, a current Bearer token supplied with cancellation support, and an account-change subscription. Both mounted panels and send preflight use that session. The host must bind its tokens to the reported account. No account tokens are stored, returned from preflight, or placed in DOM/URLs. `apiOrigin` must be a canonical HTTPS origin without credentials, path, query or fragment. The derived endpoints are `/v1/connection` and `/v1/billing`. Deploy the host and API on the same origin and configure the appropriate server origin allowlists. Host CSP and asset serving remain the host's responsibility.

`billing` accepts existing `SessionBillingOptions` except `apiBase`; `connection` accepts existing `SessionConnectionOptions` except `apiBase`. Top-level `request` is an optional shared transport, with per-panel overrides available for host/test composition. The billing panel automatically reads saved license status by default; its initial load remains available at `account.billing.initialStatus`. Language packs and billing labels are configured separately using the existing component contracts. Default billing labels are English.

Every `checkBeforeSending()` performs a new connection check. If it is verified, it then reads fresh saved licensing with the current host token. Licensing is read after the connection probes so the result is not waiting through those probes. Immediately before returning, the component refreshes connection evidence, verifies its expiration, rechecks account/generation/cancellation, and requires at least one currently active license whose start has been reached and expiration is still in the future. Either saved Individual or Business licensing matches the existing server's any-active-license send policy. Read failure, invalid response, authentication failure, offline/unverified connection, absent/expired licensing, account switch, superseding preflight or disposal returns `false`. Preflight creates no checkout, payment, renewal or transfer.

The visible saved-license list, a payment callback, or an old `true` result cannot authorize sending. Preflight is a UI check at one moment: continue immediately to the authenticated server API, which independently checks current authority and connection evidence. Do not persist its result or send a `ready`/`paid` flag as proof. A later account change or revocation can still make the server reject creation. This component does not automatically reconcile refunds/disputes or replace server-side entitlement checks.

Account changes abort pending license preflight and reset both panels. Generation checks also reject an old operation when the account switches away and back to the same ID. New preflight calls supersede old ones. Teardown aborts pending work and removes all component-owned session subscriptions and DOM nodes. The account component's two panels have their existing independent deadlines; preflight is bounded by those operations rather than a new combined deadline.

Validation uses DOM fixtures and synthetic local responses for combined readiness, fresh token use, missing/expired/unavailable licenses, unverified connections, stale account replies, superseded requests, withdrawn connection evidence and disposal. No real customer account, external connection probe, provider checkout or payment is created by these tests. Host login/mounting and asset serving, live providers/credentials, composer integration, deployment, real-device checks and worldwide compatibility remain unfinished.
