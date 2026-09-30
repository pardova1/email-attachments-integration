# Horizontal scaling and simultaneous transfers

The system is designed so one sender never owns the processing pipeline. Each email/file transaction has an independent transfer ID and independent queued work.

## Required architecture

- Stateless API instances behind load balancing.
- Durable distributed work queue.
- Horizontally scalable transfer workers.
- Multipart/direct-to-object-storage upload so application servers do not buffer 500 GB files in RAM.
- Distributed metadata database with appropriate replication/failover.
- Idempotency keys so retries do not create duplicate transactions.
- Backpressure when a dependency is unhealthy instead of accepting work that cannot be safely processed.
- Autoscaling driven by queue depth, active transfers, throughput, error rate, storage health, CPU, memory, and network capacity.
- Regional capacity so users can be routed to healthy nearby infrastructure where legally/operationally appropriate.
- Per-transfer isolation: failure or retry for one transfer must not corrupt or stop unrelated transfers.
- Cryptographic verification remains mandatory regardless of traffic volume.
- Four-hour receiver download window begins only after verified completion.

## Capacity principle

100 simultaneous senders, thousands, or much larger populations must be handled by adding processing capacity rather than serializing all work through one process.

No finite system can truthfully guarantee zero slowdown or zero failure at unlimited traffic. Production capacity therefore requires measured load tests, redundancy, autoscaling limits, provider quotas, disaster recovery, and capacity planning for the intended peak load.

The system must degrade safely: queue work, preserve transaction state, retry recoverable operations, and notify affected users rather than corrupting files or silently losing transfers.
