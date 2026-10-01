# Recovery agent capacity

Every large-file email transaction has a transfer ID and lane ID. Every detected problem receives its own issue ID/label.

The Main Storage Director does not use one global repair worker. It coordinates an elastic recovery-agent pool. Each simultaneously affected transfer receives an isolated recovery assignment so work on one transfer does not intentionally serialize unrelated repairs.

## Operating requirement

**Labeled email/transfer → labeled lane → problem detected → isolated recovery assignment → analyzing → correcting → transfer continues → verify exact**

Recovery capacity scales with demand. Production infrastructure must provision enough worker capacity for the measured peak and automatically scale toward current demand.

The system must never silently discard an issue when recovery capacity is insufficient. A capacity shortfall is itself an operational incident requiring immediate scale-out/escalation while transfer state remains durable.

## Engineering limit

“No waiting line under any possible load” cannot be guaranteed by finite infrastructure. A sudden workload can arrive faster than new compute/storage/network capacity can physically be provisioned. The architecture therefore targets immediate assignment using warm spare capacity plus rapid autoscaling, while a durable priority mechanism protects any work during the short interval required to add capacity.

This protection is not a single serial repair queue: recovery assignments remain isolated by transfer/lane, and added workers process them concurrently.
