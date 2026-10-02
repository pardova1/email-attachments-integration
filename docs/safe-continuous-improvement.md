# Safe continuous improvement

The Transfer Research & Improvement Agent may continuously discover better ways to move large files, but discoveries do not directly modify live transfer lanes.

Upgrade path:

**Research → validate → compatibility check → isolated testing → limited rollout → production approval**

If integrity, security, compatibility, lane isolation or performance requirements fail at any stage:

**Automatic rollback → existing operating version remains active → active transfers continue unaffected.**

Production upgrades must preserve:

- independent transfer lanes;
- fastest secure eligible routing objective;
- primary/backup storage recovery;
- sender/receiver access rules;
- four-hour receiver download window;
- byte-for-byte file preservation;
- final cryptographic verification;
- **SEND → RECEIVE → ✓ VERIFIED EXACT**.

This separation allows research to remain continuous without making active customer transfers experimental.
