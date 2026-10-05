# Dedicated code research, repair and upgrade agents

## Code Research Agent
Researches errors and upgrade needs before code is changed. It reproduces/validates evidence, traces root cause, maps affected dependencies, checks current supported APIs/security guidance, compares safe approaches and documents risk. Research uses source code, tests, logs/telemetry and authorized public technical documentation; it does not inspect private transfer payloads.

## Code Repair Agent
Implements the smallest safe correction for confirmed defects. It updates/adds tests and cannot weaken authorization, private-Lane isolation, expiration enforcement or whole-file integrity to make a failing test pass.

## Code Upgrade Agent
Handles supported dependency/runtime/API/framework migrations. Upgrades flow through the existing Safe Upgrade Pipeline and compatibility/dependency-impact checks. Newest is not automatically safest: the selected version must be supported, secure and compatible.

## Code Maintenance Supervisor
Coordinates the three roles and communicates with the System Coordination Supervisor, Infrastructure Knowledge Agent, security/integrity specialists and affected components.

Error flow:

**Detect → preserve evidence → Research Agent → root cause → Repair/Upgrade Agent → compile → tests → security → dependency compatibility → private-Lane isolation → VERIFIED EXACT regression → recovery-chain verification → controlled rollout → monitor → rollback if necessary**

No agent may silently merge an unvalidated change into production. Automated preparation, testing and controlled remediation are encouraged; production promotion remains governed by the safe deployment policy and required authorization.

## Error classes
Compile, test, runtime, security, dependency, compatibility, performance and integrity failures are all explicitly recognized.

## Permanent goal
Keep the application code current, secure, compatible and recoverable while protecting:
- one private Lane per email transfer;
- the four-hour authoritative recipient window;
- unaffected transfers during incidents;
- exact sender-original bytes;
- final **✓ VERIFIED EXACT**.
