# Global email-method coverage

The product is designed for worldwide email environments rather than a fixed list of providers or countries.

The Email Integration Director is paired with a Global Email Capability Registry. The registry tracks standards, provider APIs, regional services, browser/desktop/mobile integrations, enterprise gateways and newly discovered submission methods.

A capability moves through:

**Discovered → researched → compatibility/security tested → supported adapter activated**

Restricted methods remain tracked so the research system can detect when legitimate integration becomes available. Retired methods remain known so clients can migrate safely.

Coverage dimensions include:
- global standards;
- regional and country-specific email providers;
- provider APIs;
- desktop clients;
- browser/webmail clients;
- Android/iOS/iPadOS mechanisms;
- Windows/macOS mechanisms;
- enterprise gateways;
- future standards and newly discovered authorized integration mechanisms.

The architecture has no fixed adapter-count limit. New cords can be added without changing the underlying transfer engine.

The goal is the broadest technically and legally available worldwide coverage. It is not valid to claim access to a proprietary or restricted email system until that system exposes an authorized integration path.

Every activated cord must preserve the same application behavior:

**email → oversized attachment → independent lane → fastest secure eligible route → automatic recovery → receiver → ✓ VERIFIED EXACT**.

## Worldwide connection requirement

The product goal is for senders and recipients in **all countries** to connect and exchange email-linked large videos and pictures. Norway, Sweden, Iran, and Kuwait are explicitly included in that goal. The recipient must be able to download without installing the application. A country must never be silently excluded from discovery or readiness tracking.

The Global Connection Readiness Agent tracks exact country, network, email provider, client, platform, and software-version environments. It requires referenced tests for DNS/TLS reachability, email delivery, attachment integration, upload, recipient download, and exact file integrity. Missing, failed, restricted, or expired evidence produces a visible readiness gap. A software-version or network change requires new evidence; a generic worldwide email protocol entry does not prove a specific country's connectivity.

Production tools must supply country/provider/software discovery, current compatibility documentation, network probes from the relevant locations, sender-to-recipient delivery tests, and large-file transfer/integrity tests. Evidence may remain current for at most 24 hours and must be refreshed continuously. Restricted paths remain research items and require an authorized viable integration before activation.

The current agent evaluates supplied test evidence in memory. It does not independently run worldwide probes, send email, or provide a continuously deployed research service. Production requires durable evidence storage, scheduled discovery/probes, configured providers, monitoring, and actual testing across countries and software environments. The sample tests use synthetic environments and do not certify real country access.

## Connection validation runner

The Global Connection Validation Runner accepts one configured probe tool for each required check. It runs those tools for an exact environment, collects referenced results, and submits an evidence snapshot to the readiness agent. Missing tools are returned explicitly. Failed, invalid, restricted, and timed-out probes cannot establish readiness; an absent recipient-installation result stays unknown and blocks verification. Exceptions are summarized without exposing provider error details.

Each probe has a configurable timeout of at most 60 seconds. Cancellation stops a run without publishing partial evidence. Probe tools receive an abort signal and should stop their underlying operations; the runner also stops waiting if a tool ignores cancellation. Evidence defaults to a 15-minute lifetime measured from the start of validation. No production probe tools are registered by this implementation, so it cannot currently certify real worldwide access or send test emails.

## HTTPS network probe

The HTTPS Connection Probe is the first executable network-check adapter. An operator configures the service's HTTPS health URL and the probe location's country/network identity. The probe uses HEAD, requires the expected health identifier, rejects redirects, omits credentials, bypasses caches, and forwards cancellation to fetch. A different requested country or network is rejected without making a request. Results have retrievable in-memory receipts (the latest 1,000 per probe) identifying the actual configured vantage, target, timestamp, HTTP status, and generic outcome.

This checks reachability from the executing worker. Operators must verify the worker's real location/network before configuration; this adapter does not geolocate itself or measure a recipient device's connection. It does not prove email delivery, upload, recipient download, or file integrity. Deploying probes in each relevant environment and registering their tools remains pending. Adapter tests use synthetic HTTP responses; the application health endpoint is checked by a local HTTP smoke test.

## Automatic behind-the-scenes discovery

Country, network, provider, software, and connection selection are **system responsibilities**. Senders and recipients must not be asked to choose their country, identify their internet software, configure routing, or resolve compatibility. Their normal email/attachment/download workflow remains the customer interaction. The system automatically rediscovers changed networks and software, checks compatibility, and selects authorized working connections.

The Automatic Connection Coordinator's check API accepts only cancellation, not customer-selected country or software fields. An internal discovery adapter supplies trusted network/location observations and automatically collected provider/client/platform/version metadata with a source reference. The coordinator rejects missing, future, or older-than-five-minute observations, selects probe tools through an internal catalog, and runs validation. Discovery/catalog failures are generic internal retry states; readiness gaps remain internal operational work. No customer configuration fallback is introduced.

Production still needs automatic network/location and software discovery adapters, an operational probe catalog, a background retry/scheduling service, and deployment wiring. Do not infer a receiver's real location from their email domain or trust arbitrary forwarded-IP/country headers. Operators configure discovery services and probe deployments; customers do not. This coordinator is tested with synthetic discovery tools and does not currently identify real worldwide customer environments.
