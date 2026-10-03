# Per-transfer cryptographic isolation

Every large-file email send receives its own transfer ID, private Lane/Tunnel and cryptographic security context.

A person's or business's paid license authorizes service use. It is **not** the encryption boundary. Sending multiple emails under one license creates multiple independent transfer security contexts.

Production requirements:
- unique per-transfer cryptographic context;
- scoped key references tied to transfer ID + lane ID;
- raw encryption keys must not appear in application logs or ordinary transfer metadata;
- production keys should be generated/protected through a managed KMS/HSM or equivalent secure key service;
- key access is least-privilege and transfer-scoped;
- key rotation/destruction follows lifecycle and retention policy;
- compromise/failure of one transfer context must not authorize another transfer;
- final plaintext reconstruction must still match the sender-original whole-file hash.

Encryption protects the passage; it must never intentionally transform the receiver's final file bytes.

**License → authorize send → fresh transfer → fresh private lane → isolated crypto context → secure transport → receiver → decrypt/reconstruct → ✓ VERIFIED EXACT**
