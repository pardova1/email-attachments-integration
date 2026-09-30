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
Foundation initialized. Implementation will be added incrementally with documented interfaces and tests.
