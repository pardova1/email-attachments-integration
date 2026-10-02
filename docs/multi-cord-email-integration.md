# Multi-cord email integration architecture

Think of the Email Integration Director as a multi-outlet hub with expandable cords.

Each cord implements one legitimate email submission or compose-integration family. The transfer engine behind the hub remains the same.

Initial cord families include:

- authenticated SMTP/message submission;
- JMAP EmailSubmission where supported;
- provider APIs such as Gmail API and Microsoft Graph;
- desktop mail-client extensions/add-ins;
- browser compose extensions;
- mobile share/compose integrations;
- authorized enterprise mail gateways;
- future standardized/provider-specific methods added as they become available.

The Director detects the supported environment and automatically selects an authorized compatible cord. Users should not need to know which protocol/API is underneath.

## Important distinction

There is no finite static list that can truthfully guarantee every present and future way to send email. Providers can create proprietary interfaces, restrict third-party access, retire APIs or introduce new standards.

Therefore the architecture provides **unbounded adapter extensibility**, not a false claim of literal universal access. The Competitive Transfer Intelligence Agent continuously identifies new legitimate methods, and a new cord can be implemented and validated without redesigning the large-file transfer engine.

## Common behavior above every cord

Regardless of the email integration:

**Written email → familiar attachment action where the platform permits integration → oversized file recognized → sender confirms expiration → transfer gets label + independent lane → fastest secure eligible route → automatic recovery → recipient email-centered delivery → final whole-file cryptographic verification → ✓ VERIFIED EXACT**

No adapter may bypass provider authorization, security controls, or platform restrictions.
