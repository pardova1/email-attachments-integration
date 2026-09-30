# Immutable File Integrity Command

This is a system invariant, not a configurable product preference.

## Command

SEND -> RECEIVE -> VERIFIED EXACT

Every successfully delivered file must be byte-for-byte identical to the sender's original file.

No agent, provider, adapter, optimization system, upgrade, or transfer route may intentionally resize, compress, transcode, crop, enhance, convert, rewrite metadata, or otherwise mutate the user's file.

Chunking, encryption, and temporary transport packaging are permitted only when they are reversible transport operations and the final reconstructed bytes are identical to the original.

A transfer must not be marked successful until whole-file cryptographic verification succeeds. An integrity mismatch triggers recovery or failure, never successful delivery.

The Operations Supervisor may automatically delegate pre-authorized recovery and operational work to specialist components behind the scenes. Tasks requiring payment, new privacy permissions, or other explicit user authorization remain user-visible.
