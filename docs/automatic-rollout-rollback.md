# Automatic rollout guard and rollback

An upgrade can pass isolated tests and still expose a problem when it begins operating with the rest of the system. The Rollout Guard therefore evaluates the candidate during controlled rollout.

Required observations include:
- compilation;
- tests;
- security;
- dependency communication/operation;
- private-Lane isolation;
- authoritative four-hour expiration;
- VERIFIED EXACT;
- recovery-chain verification.

If any required observation fails:

**Stop candidate rollout → preserve unaffected Lanes → select last known-good version → notify Code Maintenance + System Coordination + Infrastructure agents → coordinate recovery → verify chain before resuming.**

Rollback is not permission to destroy active transfer state. Durable transfer/Lane/checkpoint state remains separate from application release version so an affected transfer can recover from verified progress where safe.

The last-known-good version must itself be an approved, traceable release; it is not guessed by an agent.

This guard defines rollout policy. Actual production deployment automation still needs to be connected to the eventual hosting/deployment environment.
