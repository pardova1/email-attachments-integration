# Sender transfer authorization

Creating a transfer requires the sender's authenticated account and an active license. Once creation and private-key setup succeed, the response includes `uploadToken`, signed for that transfer ID with `upload` scope and the existing upload deadline.

Use `Authorization: Bearer <uploadToken>` for part upload, transfer status, and completion requests. The API checks the signature, claim types, deadline, scope, and transfer ID before those handlers run. Missing or invalid credentials return HTTP 401 with `SENDER_TRANSFER_AUTHORIZATION_REQUIRED`. Knowing a transfer ID alone does not authorize these operations.

Recipient links carry a separate `download` token. Download tokens cannot authorize sender operations, and upload tokens cannot authorize downloads. The service also checks authoritative transfer expiration and terminal expired state after token authorization.

The upload token is a bearer capability: possession authorizes its transfer until expiry. Clients must keep it private, use HTTPS, and avoid logging or including it in recipient links. Restart recovery can reuse an unexpired token when the signing secret remains stable; changing the secret invalidates existing tokens. No token refresh endpoint is provided yet. Sender status requests stop at the upload-token deadline even when a later recipient download window remains open.

Existing clients must read `uploadToken` from the creation response and attach it to these requests. These headers use transfer credentials; the account access token remains required for creating a new transfer.
