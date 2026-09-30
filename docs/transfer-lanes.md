# Per-transfer lanes

Every email large-file transaction receives its own logical transfer lane.

Think of each transfer as a car with its own managed lane. The lane owns that transfer's identity, state, chunk scheduling, retry/recovery state, integrity verification context, and completion lifecycle.

A slow, failed, or recovering transfer must not mutate, corrupt, or stop another transfer.

## Production behavior

- Each transfer has a unique lane ID and isolation key.
- Parts within a lane may move in parallel when capacity permits.
- The scheduler allocates bandwidth and workers across lanes.
- Autoscaling adds shared worker/network/storage capacity as demand rises.
- Backpressure queues work safely when a dependency reaches a hard capacity limit.
- Retries stay within their transfer lane.
- Integrity verification stays within its transfer lane.
- Completion of one lane is independent of other lanes.
- App-to-app secure mode can bind its per-transfer cryptographic context to the lane.

The lane is logical isolation over shared scalable infrastructure. It is not a physically dedicated internet cable or a guarantee of unlimited bandwidth. Real transfer speed remains constrained by sender/receiver internet connections, network paths, infrastructure capacity and provider limits.

The design goal is to prevent avoidable application-level contention and cross-transfer interference while scaling capacity horizontally.
