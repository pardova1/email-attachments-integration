# Approved release registry

Rollback must target a known, tested release rather than a version guessed by an agent.

An approved release records:
- application version;
- exact source commit;
- approval time;
- required successful checks;
- current approval status.

Required checks include compilation, tests, security, dependency compatibility, private-Lane isolation, four-hour expiration, VERIFIED EXACT and recovery-chain verification.

When a new release becomes approved, the previous approved release becomes superseded. A release can be revoked if later evidence shows it is unsafe.

The Rollout Guard may use only an approved last-known-good target. If there is no unambiguous approved release, automated rollback must stop and escalate rather than guessing.

The current registry is an in-process policy implementation. Production requires this release record to be stored durably and tied to the actual deployment platform/artifact identity.
