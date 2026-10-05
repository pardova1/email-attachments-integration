# Integration operating-status monitoring

Integration resilience begins before total failure.

The Integration Operating Monitor evaluates authorized service adapters using operational metadata such as:
- success/failure rate;
- latency;
- consecutive failures;
- provider rate limiting;
- authentication state.

States:
**Operating → Degraded → Unavailable**

A degraded state alerts System Coordination and Infrastructure so the system can investigate and prepare. An unavailable state triggers integration-failover coordination.

Thresholds in the initial implementation are policy defaults and must become configurable and service-specific in production; different providers have different normal latency, rate limits and failure behavior.

Monitoring uses operational metadata and must not inspect private file/email content.

A status signal alone must not alter transfer bytes, reset the private Lane, restart the four-hour receiver window or mark a file VERIFIED EXACT.

Combined flow:

**Monitor → detect degradation → notify agents → dependency-impact assessment → if unavailable, authorized adapter failover → recovery-chain verification → continue safely.**
