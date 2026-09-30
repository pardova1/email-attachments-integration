# Receiver assistance

Receiver-facing notices remain simple. Technical diagnostics, integrity records, retry histories, and violation IDs stay in the backend.

The backend attempts automatic recovery first. A receiver notice is shown only when receiver action is required.

Supported guidance includes:
- interrupted download: retry
- repeated connection failures: recommend the application for a more reliable secure connection
- insufficient device storage: explain how to free storage and retry
- offline network: reconnect and retry
- browser download restriction: allow the download and retry
- permission denial: grant the necessary download/storage permission and retry
- unsupported environment: recommend the application

The active 4-hour transfer expiration/countdown must remain visible with receiver assistance.

No recovery or assistance path may alter the original file. Successful delivery still requires SEND -> RECEIVE -> VERIFIED EXACT.
