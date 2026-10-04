# Authoritative four-hour receiver window

The receiver's four-hour period does **not** begin when the sender first selects the file and does not run while a large upload is still being transported.

It begins only after the complete reconstructed file passes the required whole-file integrity verification and becomes available to the receiver.

The backend stores one authoritative `downloadAvailableAt` and `downloadExpiresAt` in durable transfer state. Email, app, browser and notification surfaces derive their countdown from that same expiration instant.

Changing a phone/computer clock or switching time zones does not extend the transfer. Time-zone displays are localized views of the same server-controlled expiration instant.

If a worker/server is replaced, the new worker restores `downloadExpiresAt` from durable state rather than starting another four-hour period.

At zero:
**🔴 Transfer Expired — 00:00:00**

The recipient must ask the sender to send the file again. An expired transfer is not silently reactivated by recovery logic.
