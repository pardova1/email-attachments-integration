# Architecture

## Core flow
1. Sender selects large videos/photos through a supported attachment integration.
2. The bridge creates a secure transfer session.
3. The client uploads the file in resumable chunks.
4. A storage adapter persists chunks/object data.
5. Failed/interrupted chunks can be retried without restarting the whole transfer.
6. Completion creates a recipient-accessible delivery object.
7. Notification adapters will send sender confirmation and recipient Watch/Download access.

## Components
- Client adapters: Android, web, later iOS/Windows/macOS and email-provider surfaces.
- Transfer API: sessions, progress, chunk acceptance, completion.
- Transfer service: validation, resumability, recovery state.
- Storage port: provider-neutral object storage interface.
- Metadata persistence: durable session/ownership/expiration state (next implementation stage).
- Notification port: provider-neutral sender/recipient messages (next stage).
- Authentication/access: scoped, expiring tokens (next stage).
- Optimization layer: future capacity, recovery, performance, and security agents.

## Large-file strategy
The initial product target is 500 GB per transfer. Provider limits must not leak into domain interfaces. Chunk size, concurrency, retry policy, storage provider, and bandwidth policy remain independently configurable.

## Privacy/security direction
- TLS for network transport.
- Encryption at rest at the storage layer.
- Short-lived scoped transfer/access tokens.
- Expiration and revocation.
- Minimal metadata collection.
- No unnecessary file-content inspection.
- Production secrets never stored in source control.

## Current development adapter
The in-memory storage adapter exists only to make the transfer domain executable/testable. Production storage will replace it without changing the transfer API contract.
