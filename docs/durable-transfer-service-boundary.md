# Durable Transfer Service boundary

The durable-state boundary owns persistence and reconstruction of transfer runtime state.

It can:
- create the first durable record for a transfer/Lane;
- save progress with repository version checks;
- restore the same TransferSession and canonical TransferLane after process replacement.

The restart test deliberately creates a second service instance with empty process memory and proves that transfer ID, Lane ID, verified/confirmed progress and expiration are restored from the repository.

This boundary is being introduced before changing the public TransferService API because older repository tests/callers still contain pre-integrity assumptions. The coordinated migration must update those callers rather than weakening current requirements such as original SHA-256.

Production durability is not achieved by the current MemoryTransferStateRepository. A real database-backed repository is still required. The boundary ensures TransferService will not depend on a particular database implementation when that adapter is introduced.
