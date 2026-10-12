# Durable transfer key lifecycle

The optional server-only Vault Transit adapter implements the existing
`TransferKeyVault` interface used by private lane creation, persisted references
and expiration cleanup. Without a selected provider, development retains the
memory adapter and production still refuses to start. Unsupported or incomplete
configuration fails immediately; configured but inaccessible Vault operations
fail without marking a lane retired.

## Configuration

Set `TRANSFER_KEY_VAULT_PROVIDER=vault-transit`, `VAULT_ADDR` to an HTTPS origin,
and `VAULT_TOKEN` through the server's secret environment. Optional settings are
`VAULT_TRANSIT_MOUNT` (default `transit`), `VAULT_NAMESPACE` (default root), and
`TRANSFER_KEY_VAULT_TIMEOUT_MS` (default 10,000; allowed 1–60,000). HCP Vault
Dedicated uses its configured namespace, commonly `admin`. Address paths,
embedded credentials, query parameters and unsafe mount/namespace paths are
rejected. Tokens are never stored in transfer references or returned to clients.

Operators must provision and unseal a durable Vault deployment, enable Transit
at the selected mount, configure its seal/storage/backup controls, and issue a
restricted service token. For the default mount the lifecycle adapter needs:

```hcl
path "transit/keys/bridge-*" {
  capabilities = ["update", "read", "delete"]
}
```

The prefix policy covers both the named-key endpoint and its `/config` endpoint.
Grant no key export, plaintext backup, general secret access or administrative
capabilities. Restrict allowed parameters separately where operationally
appropriate. Provisioning, token renewal/rotation and process supervision are
operator responsibilities; the adapter does not create a Vault account, enable
mounts, auto-login or renew tokens. Restart after changing server credentials.

## Allocation and retirement

Each allocation uses a fresh opaque random name scoped through a SHA-256 hash
of the transfer identity, lane identity and random allocation ID. No file content
is sent to Vault. The adapter creates an AES-256-GCM key with derivation,
exportability and plaintext backups disabled, then reads metadata to verify its
name and properties before returning a reference. New allocations never reuse
retired references, including when callers reuse a transfer/lane identity.

References include a fingerprint of the HTTPS origin, mount and namespace.
Process replacement with the same configuration can retire a persisted reference;
token rotation preserves that binding. Different endpoint, mount or namespace
configuration rejects old references before making requests. A deployment moving
to a new URL requires an explicit reference migration; do not silently remap it.
The fingerprint binds configuration, not the physical cluster's identity. Operators
must preserve the intended backend and must not substitute an unrelated cluster
behind the same address or restore retired keys from a backup.

Retirement reads current metadata, enables deletion for that key, performs an
authorized DELETE, and confirms an absent-key response. Even an initial empty
404 requires successful DELETE before retirement is accepted. Arbitrary 404s,
permission errors, retained keys, unsafe metadata and malformed responses fail
closed. Repeated destruction is supported for cleanup after process replacement.
The lifecycle coordinator keeps failed cleanup expired and retries it later.

The whole allocation or retirement operation has one deadline, including response
parsing. Requests reject redirects and use no browser cookies or response cache.
JSON is limited to 64 KiB; provider details and secrets are masked in errors.
Late transport completion after the deadline cannot publish a reference or start
additional calls. No automatic allocation retry occurs in this adapter.

## Verification and remaining work

Synthetic HTTP tests cover isolated references, process replacement, repeated
retirement, credential rotation, foreign-reference rejection, unsafe metadata,
failed retirement recovery, malformed replies and stalled transport/body parsing.
The full existing suite checks compatibility with transfer state, recovery,
notification and connection services. These are not live Vault validation.

This interface manages key lifecycle only. It does not encrypt upload chunks,
fetch raw keys, perform envelope encryption, or prove that stored files are
encrypted. Connecting byte encryption/decryption to transport remains separate
work. Vault backup retention also means API deletion alone is not proof of erasure
from all backups.

A crash or timeout between provider key creation and durable reference persistence
can leave an unreferenced key. The adapter avoids reusing its reference and does
not guess at late provider outcomes. Durable allocation reconciliation and orphan
cleanup remain necessary before relying on complete lifecycle cleanup in production.
Vault credentials, policy/API validation against the actual deployed version,
production hosting and live worldwide transfer testing remain pending.

Official references:

- [Transit HTTP API](https://developer.hashicorp.com/vault/api-docs/secret/transit)
- [Vault HTTP API and namespaces](https://developer.hashicorp.com/vault/api-docs)
- [Transit engine](https://developer.hashicorp.com/vault/docs/secrets/transit)
