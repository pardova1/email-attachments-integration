# Private lane lifecycle

Every send event creates exactly one canonical private logical Lane/Tunnel for that transfer and a separate cryptographic context.

The same lane identity follows the transfer through normal routing, route changes, storage failover, automatic recovery and integrity verification. Internal recovery does not merge the transfer with another lane.

Lifecycle:

**Send authorized → fresh Transfer ID → fresh Lane ID → fresh cryptographic context → active → optional recovery/rerouting → verified → expiration/cleanup → retire cryptographic context**

A sender license may authorize many sends, but every send creates a new lane and security context.

Retirement means the transfer-specific cryptographic context is released/destroyed according to the production key-management and retention policy. Ordinary business administration cannot prevent lane isolation or obtain payload access.

The coordinator keeps a process-local lifecycle cache. Durable transfer state preserves the canonical lane ID and opaque key reference; restoring an active transfer rebuilds its context before publishing the session.

When an expired transfer is encountered after restart, cleanup uses that saved reference to retire the original key without creating a new key or activating the transfer. A persisted expired status remains terminal even if timestamps are later changed. Failed retirement leaves the transfer unavailable and can be retried on the next restore attempt. Successful retirement is not repeated within the same coordinator. Across process replacements, production vault implementations must tolerate repeated destruction of an already-destroyed reference.

The server also starts a background expiration worker at startup and runs a batch every minute while the process is running. Each batch scans up to 100 transfer IDs, using a cursor so a failed record does not block later records. The worker selects the download deadline when present, otherwise the upload deadline, and always includes persisted expired records for cleanup retry. It rereads each record and marks it expired using the repository version check before purging bytes and retiring the key. Concurrent completion cannot lose its new download window to a stale expiration decision.

Supabase cleanup lists chunk objects in batches and deletes their exact paths. Passing a folder path to the remove API does not recursively delete its contents.

Cleanup failures emit a generic retry-required server log without key references or file details. The cursor wraps at the end of a pass, so retries and newly eligible records are revisited. Completed cleanup records currently remain eligible on later passes; durable cleanup receipts and distributed worker leases remain scaling improvements. Production vault destruction must therefore remain idempotent. Stopping the server stops this worker; startup resumes scans. This code does not provision an always-running production deployment or a production key-vault provider.
