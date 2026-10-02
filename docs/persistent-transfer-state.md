# Persistent transfer state

Large email transfers must not depend on the memory of one application process.

Durable transfer state includes the canonical transfer ID and lane ID, original SHA-256, total size, confirmed parts and part hashes, active storage route, upload expiration, download availability/expiration, recovery state and a version number.

The production repository should use a durable replicated database. The in-memory adapter exists only as a development/test implementation of the repository contract.

Optimistic version checks prevent two workers from silently overwriting newer transfer progress.

After a process restart, a worker can reload the transfer, reconstruct its lane/recovery context, preserve cryptographically verified progress and continue automatically. A restart must not reset the receiver's authoritative expiration timestamp or cause verified bytes to be discarded unnecessarily.

**Persist → recover state → verify checkpoint → resume affected lane → final whole-file verification → ✓ VERIFIED EXACT**
