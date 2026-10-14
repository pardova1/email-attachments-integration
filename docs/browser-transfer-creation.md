# Browser sender transfer creation

The standalone `connection-assistance.js` bundle exports `SenderTransferClient`, `SenderTransferClientError` and the `SenderTransferInput` / `CreatedSenderTransfer` types. This adapter creates a transfer through the authenticated server boundary. It does not select, hash, read, upload, or deliver a file, create a checkout, or send email.

```ts
import {SenderTransferClient} from "/assets/connection-assistance.js";
const transfers = new SenderTransferClient("https://your-app.example/v1/transfers", session);

// In the host's attachment/send handler, after selecting a file,
// computing its original SHA-256 and explicitly confirming the download window:
if (await account.checkBeforeSending()) {
  const transfer = await transfers.create({
    fileName: file.name,
    contentType: file.type || "application/octet-stream",
    totalBytes: file.size,
    originalSha256,
    senderExpirationConfirmed: true
  });
  // Keep transfer.uploadToken private for authenticated chunk upload.
  // Transfer creation is not upload completion or email delivery.
}

// On host teardown:
transfers.dispose();
```

`session` is the same `ConnectionApplicationSession` used by the account panels. Tokens must belong to its current account; the client acquires one for each creation. Account changes, including switching away and back, abort pending work. Scope is checked after token retrieval, network response, each body read and immediately before returning the result. A disposed or signed-out client cannot create a transfer. Overlapping creation on one client returns `TRANSFER_BUSY` before starting another request.

The trusted configured HTTPS base must end in `/v1/transfers` and contain no credentials, query or fragment. Use a same-origin host/API and configure the transfer router's `allowedOrigins` through its server composition. Browser origins are rejected by default; this adapter does not configure CORS, hosting, discovery/probe adapters or server origin settings. The current default server leaves live transfer discovery/probes unconfigured and therefore unavailable. The client does not bypass that gate.

Metadata follows the server's strict contract: positive integer size up to the shared initial 500 GiB limit, optional chunk size up to 64 MiB, 64-digit SHA-256, filename/content type and explicit expiration confirmation. Optional software hints and owned fallback form selections follow the existing connection contract. Identity, ready/paid flags, credentials and extra fields in the JSON body are rejected. Browser and server import the same platform-independent limit constants; existing server exports retain their names. For very large files the host will need bounded-memory incremental hashing; loading an entire 500 GiB file for Web Crypto digest is not a viable integration. No hashing implementation is added here.

Creation responses require strict JSON within 16 KiB. The client checks transfer UUID, requested/default chunk size, future upload deadline, exact relative part path and the upload capability's structural transfer ID/scope/expiry binding. Structural checks do not verify a cryptographic signature; the server checks that signature on sender operations. No arbitrary response-selected upload origin is accepted. Requests omit cookies, reject redirects and use `no-store`; one configurable deadline (default 40 seconds, 1–120,000 ms) covers session token, transport and body processing. Private server/transport details become fixed client error codes.

`uploadToken` is a private bearer credential returned to the host, distinct from the account token and recipient download token. Keep it in private memory, pass it only in Authorization headers to the trusted transfer API, and do not render, log, persist, or include it in recipient/email links. Notices must be inserted as text if the host displays them. The result is not rendered or stored by this adapter.

Creation has no automatic retry. The current API has no creation idempotency key: timeout, disconnect or an account switch cannot undo a server operation already started, and blindly repeating creation can make another transfer. Reconciliation/idempotent creation and cleanup remain separate work. Completed uploads still need chunk checksums, completion verification and the recipient flow. Host mounting, file selection/streaming hashes, chunk upload, composer integration, providers, credentials, hosting, real-device testing and worldwide validation remain unfinished.

Regression coverage includes metadata/size limits without allocating giant files, fresh tokens, response capability/path validation, account races, cancellation, bounded waits/body decoding, error privacy, overlapping calls and teardown. A local HTTP test uses synthetic connection probes and an in-memory license/transfer, and checks the server-issued upload token. It does not send a real file, email, provider payment or external probe.

## Upload and completion follow-up

The same client now supports scoped chunk upload and exact completion; see [browser upload contracts and remaining host responsibilities](browser-transfer-upload.md). Preserve the original object returned by `create` for these operations. The host still supplies the original whole-file hash and chunk slices.
