# Persistent transfer state

Large email transfers must not depend on the memory of one application process.

Durable transfer state includes the canonical transfer ID and lane ID, original SHA-256, total size, confirmed parts and part hashes, active storage route, upload expiration, download availability/expiration, recovery state and a version number.

The production repository should use a durable replicated database. The in-memory adapter exists only as a development/test implementation of the repository contract.

Optimistic version checks prevent two workers from silently overwriting newer transfer progress.

After a process restart, a worker can reload the transfer, reconstruct its lane/recovery context, preserve cryptographically verified progress and continue automatically. A restart must not reset the receiver's authoritative expiration timestamp or cause verified bytes to be discarded unnecessarily.

**Persist → recover state → verify checkpoint → resume affected lane → final whole-file verification → ✓ VERIFIED EXACT**
## Concurrent upload progress

Progress saves merge the current durable confirmed-part set with newly acknowledged parts. Optimistic version conflicts reread the latest record and retry up to three save attempts, preserving terminal completed and expired states. Different workers uploading different parts therefore do not overwrite each other's confirmed progress.

Upload progress is published to the process cache only after its metadata save succeeds. A failed save leaves stored bytes available for an identical part retry without falsely acknowledging that part. Completion rereads durable confirmed parts before deciding whether every part is present, so an older worker can complete a transfer uploaded across several workers.

Upload expiration is checked again after the storage write. A write that crosses the deadline does not advance confirmed progress; normal expiration cleanup removes the stored bytes. These changes preserve part receipts, not distributed worker leases or exactly-once external storage operations.

## Refreshing cached transfer state

Sender HTTP status requests refresh durable state before returning progress. Recipient download requests refresh before verifying the file and again before sending attachment bytes. A worker with an older cache can therefore observe completion, progress, or expiration saved by another worker without restarting or extending the recipient deadline.

A refresh failure clears the process-local session and lane cache rather than serving stale data. A later successful refresh can restore the same canonical transfer. Expiration cleanup rereads and version-checks the current deadline, so an outdated upload-expiry snapshot cannot purge a newly established recipient window; that request returns a retry-required error instead.

These refreshes check state at request boundaries and immediately before delivery. They do not provide a distributed lease covering the entire download stream.
