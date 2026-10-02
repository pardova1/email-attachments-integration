# Automatic integrity recovery supervisor

The Operations Supervisor applies the integrity recovery policy to each affected transfer lane.

Priority order:

1. Continue verified untouched progress.
2. Automatically retransmit altered or unverifiable parts from sender-original bytes.
3. If partial repair cannot safely establish exact integrity, internally restart the affected transfer.
4. Contact a user only when automated recovery is exhausted or required source bytes are no longer available.

The system must not ask the sender or receiver to troubleshoot a problem that it can safely correct itself.

Every automatic repair or restart still requires final whole-file cryptographic verification before successful delivery is declared.

**Problem detected → isolate affected lane → diagnose → repair/retransmit OR internal restart → verify entire file → RECEIVE → ✓ VERIFIED EXACT**

Other transfer lanes remain independent.
