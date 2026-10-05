# Recovery chain verification

Repairing the first failing component is not enough.

Before an incident is declared resolved, the System Coordination Supervisor must verify the affected hand-in-hand chain:

1. the repaired component operates correctly;
2. its inbound dependency works;
3. its outbound dependency works;
4. every downstream component identified by dependency-impact analysis is checked;
5. affected transfers resume only when required checks pass;
6. file delivery still ends with whole-file **✓ VERIFIED EXACT**.

Example:

**Storage repaired → Storage-to-Transfer checked → Transfer Service checked → Transfer-to-Integrity checked → Integrity checked → Recipient delivery checked → Notifications checked → affected transfer may resume**

If any required handoff still fails, the incident remains active and the affected transfer does not receive a false "resolved" status.

Unaffected private Lanes remain isolated and continue whenever their own dependencies are operating.

This is the completion side of the application's hand-in-hand rule:

**Detect entire impact → coordinate repair → verify entire affected chain → resume safely → ✓ VERIFIED EXACT**
