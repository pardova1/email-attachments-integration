# Authoritative four-hour receiver window

The receiver's four-hour period does **not** begin when the sender first selects the file and does not run while a large upload is still being transported.

It begins only after the complete reconstructed file passes the required whole-file integrity verification and becomes available to the receiver.

The backend stores one authoritative `downloadAvailableAt` and `downloadExpiresAt` in durable transfer state. Email, app, browser and notification surfaces derive their countdown from that same expiration instant.

Changing a phone/computer clock or switching time zones does not extend the transfer. Time-zone displays are localized views of the same server-controlled expiration instant.

If a worker/server is replaced, the new worker restores `downloadExpiresAt` from durable state rather than starting another four-hour period.

At zero:
**🔴 Transfer Expired — 00:00:00**

The recipient must ask the sender to send the file again. An expired transfer is not silently reactivated by recovery logic.
## Completion retries

The first successfully persisted completion establishes the recipient availability time and expiration. Retrying completion rechecks file integrity and returns that existing window; it does not extend access. Concurrent completions in one process share verification, and competing workers use the first durable completion window.

A failed metadata save publishes no new completion state or download window. A later retry can complete normally. Verification also rechecks transfer expiration before establishing availability, so an upload that expires during verification cannot start a new recipient window.
