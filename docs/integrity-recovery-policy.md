# Integrity-first automatic recovery

Recovery follows this order:

1. If existing bytes are cryptographically verified and untouched, continue from verified progress.
2. If specific parts are altered or unverifiable and the sender-original bytes remain available, automatically retransmit only the affected parts when safe.
3. If partial repair cannot safely establish exact integrity, restart the affected transfer internally from the sender-original bytes.
4. Contact the sender or receiver only as a last resort when automated recovery cannot safely complete the transfer.

An altered or unverifiable part is never treated as valid merely to avoid restarting. The Operations Supervisor chooses the least disruptive safe recovery that can still produce **SEND → RECEIVE → ✓ VERIFIED EXACT**.

Internal restart or repair affects only the affected transfer lane. Other lanes continue normally. Public technical details remain hidden; if human action is genuinely required, the public notice remains generic and does not expose internal diagnostics.
