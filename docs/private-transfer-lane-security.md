# Private transfer lane security

Every email transfer receives a unique transfer identity and private logical Lane/Tunnel.

A lane is not a claim of a dedicated physical internet cable. It is an authorization, cryptographic, state and recovery boundary around one transfer.

Rules:
- a transfer ID and lane ID must match before transfer operations proceed;
- sender access is scoped to the sender's lane;
- receiver access is scoped to the receiver's lane and active authorization window;
- automated recovery/integrity workers operate only with transfer-scoped service authority;
- another transfer cannot reuse a lane identity;
- business administration is metadata-only and does not grant payload access;
- research agents never receive private payload content;
- recovery of one lane must not change another lane's state;
- final delivery still requires whole-file cryptographic equality.

**One email transfer → one private logical passage → isolated state/security/recovery → ✓ VERIFIED EXACT**
