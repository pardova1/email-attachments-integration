# Private lane lifecycle

Every send event creates exactly one canonical private logical Lane/Tunnel for that transfer and a separate cryptographic context.

The same lane identity follows the transfer through normal routing, route changes, storage failover, automatic recovery and integrity verification. Internal recovery does not merge the transfer with another lane.

Lifecycle:

**Send authorized → fresh Transfer ID → fresh Lane ID → fresh cryptographic context → active → optional recovery/rerouting → verified → expiration/cleanup → retire cryptographic context**

A sender license may authorize many sends, but every send creates a new lane and security context.

Retirement means the transfer-specific cryptographic context is released/destroyed according to the production key-management and retention policy. Ordinary business administration cannot prevent lane isolation or obtain payload access.

The coordinator keeps a process-local lifecycle cache. Durable transfer state preserves the canonical lane ID and opaque key reference; restoring an active transfer rebuilds its context before publishing the session.

When an expired transfer is encountered after restart, cleanup uses that saved reference to retire the original key without creating a new key or activating the transfer. A persisted expired status remains terminal even if timestamps are later changed. Failed retirement leaves the transfer unavailable and can be retried on the next restore attempt. Successful retirement is not repeated within the same coordinator. Across process replacements, production vault implementations must tolerate repeated destruction of an already-destroyed reference.

This restore path performs cleanup when the transfer is accessed. A production background expiration sweep is still required for transfers that receive no further requests.
