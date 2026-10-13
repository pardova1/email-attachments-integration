# Email Attachments Integration

A cross-platform large-file email bridge designed to let users send very large videos and photos through a familiar email attachment workflow.

## Product goals
- Familiar attachment-first sender experience
- Initial transfer target: up to 500 GB
- Resumable/chunked transfers with retry and interruption recovery
- Secure transport and storage
- Recipient can watch/download without installing the app
- Sender and recipient delivery confirmations
- Android, iPhone/iPad, Windows, Mac, and web support
- Modular architecture for future provider replacement and agentic optimization

## Architecture direction
Email integration, transfer orchestration, storage, delivery notifications, authentication, and future optimization agents should remain modular and replaceable.

## Security
Never commit credentials, API keys, access tokens, private keys, or production secrets. Use environment variables and a managed secret store.

## Status
The transfer engine, authenticated connection assistance, and server-side transfer readiness gate are implemented with regression tests. Customer notifications have an optional Resend adapter; see [provider setup and current production gaps](docs/customer-email-provider.md). An embeddable [browser billing panel](docs/browser-billing.md), optional Stripe checkout and durable key-vault adapters are implemented; see [payment setup and limits](docs/stripe-payment-provider.md). Live email-composer integrations, credentials/provider provisioning, webhook provisioning/reconciliation, connection probes, deployment, and worldwide testing remain pending. The repository is not yet a completed downloadable application.
