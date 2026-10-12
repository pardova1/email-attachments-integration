# Customer notification email provider

The customer-email factory now offers an optional Resend adapter for plain-text recovery and financial notifications. It uses Resend's `POST https://api.resend.com/emails` endpoint without adding an SDK dependency. It is not a compose integration, inbox provider, or large-file attachment transport. Video/photo bytes remain on the chunked transfer path.

Configure the server's secret store/environment:

| Setting | Value |
| --- | --- |
| `CUSTOMER_EMAIL_PROVIDER` | `resend` |
| `RESEND_API_KEY` | A working server-only Resend API key authorized to send |
| `CUSTOMER_EMAIL_FROM` | A plain sender mailbox on a verified domain |
| `CUSTOMER_EMAIL_TIMEOUT_MS` | Optional integer from 1–60,000; default 10,000 |

Selecting an unknown provider, incomplete credentials, invalid sender, or invalid timeout fails configuration. Without a selected provider, development retains the unavailable adapter and production refuses to start. Selecting the adapter does not verify the key/domain or certify recipient delivery. No credentials are committed by this change, and no live messages have been sent.

The idempotent dispatcher supplies the durable outbox event key through the email port. The adapter hashes it into a bounded opaque `Idempotency-Key`; recipient identifiers are not exposed in that header. Retrying a lost acknowledgement uses the same key and original outbox payload. The adapter makes one request per invocation, rejects redirects, omits cookies, bypasses caches, bounds the response to 64 KiB, and requires a successful JSON receipt with a nonempty provider ID. Errors remain generic. Timeout/external cancellation aborts transport and response reads; late replies are discarded and their bodies released.

Resend documents a 24-hour idempotency window. This is not indefinite exactly-once delivery: retries outside that window need provider-receipt reconciliation before replaying a potentially accepted event. API acceptance also does not establish delivery to the recipient inbox. The current outbox `sent` state means provider submission succeeded, not that a verified delivery webhook was received. Timed outbox claims now support restart recovery when another worker retries the event. Bounce/delivery webhooks, automatic receipt reconciliation, queue workers, localization of all notification templates, and real sender-to-recipient tests remain required before release.

Documentation used for the adapter contract:

- [Send Email API](https://resend.com/docs/api-reference/emails/send-email)
- [Idempotency keys and their 24-hour window](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [Provider errors and sender-domain verification](https://resend.com/docs/api-reference/errors)

# Notification claim recovery

Claim ownership now lasts two minutes. A pending event or expired sending claim can be acquired atomically with a new token; the original message, first-attempt time, and retry deadline remain fixed. A stale worker cannot release or acknowledge another worker's claim. Database functions use row locks with `SKIP LOCKED`, `security invoker`, an empty search path, and execution granted only to the server service role. The obsolete claim RPC is disabled for that role.

Automatic retries use a 23-hour window from the first claim, leaving a margin inside the provider's documented 24-hour idempotency window. Expired or ambiguous legacy unsent events move to `reconciliation-required` and are not replayed automatically. The Resend adapter independently checks the persisted window before sending. A valid receipt and current owner token are both needed to mark an outbox event sent. There is still no scheduled outbox worker or receipt-reconciliation implementation; this provides recovery on a subsequent dispatch, not autonomous processing after restart.

The additive schema migration is `20261012163948_notification_claim_leases.sql`, matching the recorded migration version on the connected project. The outbox contained no messages when it was applied. Live SQL assertions verified active-claim exclusion, expiry/reclaim, unchanged attempt windows, stale-worker rejection, expired-window reconciliation, and restricted function permissions. Verification ran inside rolled-back transactions and sent no emails. A reusable SQL check is stored in `test/sql/notification-claim-leases.sql`. Deploy the migration before the new server adapter; old servers using the legacy claim RPC must be upgraded together.

The security advisor still reports only the four existing informational RLS-enabled/no-policy findings for the server-owned tables. No public row-access policies or secret exposure were introduced; see the advisor reference below.

# Infrastructure check on October 12, 2026

The connected **Email attachment integration** Supabase project reported `ACTIVE_HEALTHY`. Read-only inspection found the four expected public application tables with RLS enabled, a private `transfer-bytes` bucket with a 70 MiB object limit (sufficient for the app's 64 MiB chunks), and no deployed Edge Functions. These observations do not prove the Node application is hosted or that a full transfer succeeds.

The security advisor reported four informational RLS-enabled/no-policy findings. These tables currently belong to the server-side service-key adapters; public clients must not receive the secret key. No public row-access policies were added during this inspection. See the [Supabase advisor reference](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) if introducing direct client access; ownership policies must be designed before enabling that access.

The production payment-provider and transfer-key-vault factories still lack working adapters, and the server supplies no live connection observation/probe adapters. Resend credentials, verified domain, live email composer integration, deployment, and worldwide tests remain pending. Supabase connectivity alone is not application completion.
