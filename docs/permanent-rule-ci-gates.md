# Permanent-rule CI gates

The general test suite remains mandatory. CI also reruns the tests protecting the application's permanent invariants as an explicit gate so these rules are visible in the delivery pipeline.

Protected behaviors include:
- the receiver's authoritative four-hour download window;
- start/end/time-remaining email model;
- backend recipient-access expiration;
- one-transfer/private-Lane access isolation;
- per-transfer cryptographic context;
- one canonical private-Lane lifecycle;
- integrity-first recovery;
- post-recovery chain verification;
- final VERIFIED EXACT requirements.

CI also runs a production dependency audit at high severity.

A failing permanent-rule gate blocks the CI job. The correct response is root-cause research and a safe repair/upgrade; weakening or deleting the invariant to make the pipeline green is not an acceptable correction.

This CI layer is a repository safeguard, not a claim of production readiness. Production still requires durable infrastructure, real storage/database/queue adapters, deployment security, environment validation, monitoring and controlled release/rollback.
