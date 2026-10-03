# Private lane lifecycle

Every send event creates exactly one canonical private logical Lane/Tunnel for that transfer and a separate cryptographic context.

The same lane identity follows the transfer through normal routing, route changes, storage failover, automatic recovery and integrity verification. Internal recovery does not merge the transfer with another lane.

Lifecycle:

**Send authorized → fresh Transfer ID → fresh Lane ID → fresh cryptographic context → active → optional recovery/rerouting → verified → expiration/cleanup → retire cryptographic context**

A sender license may authorize many sends, but every send creates a new lane and security context.

Retirement means the transfer-specific cryptographic context is released/destroyed according to the production key-management and retention policy. Ordinary business administration cannot prevent lane isolation or obtain payload access.

The current coordinator uses in-process state as a development foundation. Production lifecycle state must be persisted through the durable transfer-state repository so service restarts preserve the canonical lane identity.
