# Integration failover

External integrations can fail, be rate-limited, become unavailable or change their supported interfaces. A single adapter should not automatically become a system-wide single point of failure when another compatible and authorized path exists.

Failover sequence:

**Adapter failure → Integration Capability Gateway state → Failover Coordinator → choose another authorized/operating adapter for the same capability → System Coordination observes handoff → continue affected operation**

For an active transfer, adapter failover must preserve:
- transfer identity;
- canonical private Lane;
- authoritative expiration;
- verified progress/checkpoints;
- final whole-file VERIFIED EXACT requirement.

Switching an adapter does not create a new transfer and does not restart the receiver's four-hour window.

If no compatible authorized adapter is available, the coordinator escalates. It must not use an unauthorized service, bypass provider restrictions, or silently weaken security merely to keep the operation moving.

Provider-specific retry/rate-limit behavior remains inside each adapter. System-wide dependency impact and post-recovery verification remain responsibilities of the System Coordination/Recovery architecture.
