# Incident visibility and notifications

Technical diagnostics are staff-only.

Authorized administrators and hired application staff may access internal integrity violation IDs, hashes, affected chunks, retry counts, recovery state, and technical causes according to their assigned staff permissions.

Senders and receivers must not receive those internal details. During an affected incident their public message is:

> Technical difficulties. Please try again later.

When the incident is resolved, notify every sender and receiver who was actually affected:
- Sender: "The technical issue has been resolved. You can resend your file now."
- Receiver: "The technical issue has been resolved. You can try downloading your file again now."

Incident resolution notifications should target affected parties rather than unrelated users. Internal records remain available for authorized staff troubleshooting and audit.

No public incident response may expose integrity IDs, hashes, stack traces, storage identifiers, recovery attempts, credentials, tokens, or internal infrastructure details.
