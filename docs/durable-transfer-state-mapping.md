# Durable transfer state mapping

Transfer runtime objects and durable records intentionally use slightly different vocabulary. Runtime `complete` means the file passed whole-file verification and is available; durable state records this as `available`.

The mapper guarantees restoration uses the existing:
- transfer ID;
- canonical Lane ID supplied by durable state;
- file metadata;
- original SHA-256;
- confirmed parts;
- creation/upload expiration;
- download availability;
- authoritative download expiration.

Restoration must never call the new-transfer factory because that would generate a new transfer identity and new timestamps.

A server replacement therefore follows:

**Load durable record → reconstruct runtime session → reattach canonical Lane/security references → continue from verified state.**

The four-hour receiver window is restored from `downloadExpiresAt`; it is never restarted because a worker/server changed.

This mapper is the boundary needed before Transfer Service can safely replace its RAM-only source of truth with a production repository.
