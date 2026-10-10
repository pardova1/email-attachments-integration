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

Country, network, provider, software, and connection selection are **system responsibilities by default**. The system automatically rediscovers changed networks and software, checks compatibility, and selects authorized working connections. If automatic discovery cannot identify necessary details, it displays a customer message and dropdowns for only those missing requirements. Customers are not asked to configure technical routing or solve backend failures.

The Automatic Connection Coordinator's initial check API accepts only cancellation; manual fields enter through a separate fallback submission after automatic discovery is incomplete. An internal discovery adapter supplies trusted network/location observations and automatically collected provider/client/platform/version metadata with a source reference. The coordinator rejects missing, future, or older-than-five-minute observations, selects probe tools through an internal catalog, and runs validation. Discovery failures may produce a catalog-backed customer dropdown form. Catalog failures and readiness gaps remain internal operational work; a customer selection cannot replace a passed connection test.

Production still needs automatic network/location and software discovery adapters, an operational probe catalog, a background retry/scheduling service, and deployment wiring. Do not infer a receiver's real location from their email domain or trust arbitrary forwarded-IP/country headers. Operators configure discovery services and probe deployments. Customers supply only missing basic connection details through approved dropdowns when discovery fails. This coordinator is tested with synthetic discovery tools and does not currently identify real worldwide customer environments.

## Customer dropdown fallback

The latest interaction rule is **automatic detection first, customer dropdowns only when necessary**. The fallback message explains that some details could not be identified and asks the customer to choose them. Fields can include country, internet provider/network, email provider, email app/browser, device/operating system, and software version; detected fields are retained and omitted from the form. Dropdown options come from an application-managed compatibility catalog, with no arbitrary free-text routing values.

Forms expire after 15 minutes, preserve their server-side option snapshot, and reject invented choices or attempts to overwrite already-detected fields. Selection is a routing hint, not proof of location or compatibility. Every selected environment goes through the same probe validation before connection readiness is granted. The renderer supplies labeled, required dropdowns and a Check connection button. The standalone HTML preview shows an example form, not live country certification.

Production still needs the real choice catalog, sender-scoped form persistence, authenticated/CSRF-protected form routes, frontend integration, and automatic discovery/probe deployment. The fallback implementation and preview are not yet wired into a downloadable production application.

Dropdown catalog choices may depend on earlier fields (for example, a software version on the selected app and platform). Detected details filter the available choices; changing a dropdown clears incompatible later selections. The server independently rejects incompatible combinations, including submissions made without JavaScript. If no catalog options fit the detected details, the coordinator keeps the issue in its internal retry path. These catalog rules do not replace live connection checks.

### Language selection

The connection-assistance form includes a language selector. Built-in prompt translations cover 38 languages: English, Norwegian Bokmål, Swedish, Persian, Arabic, Spanish, French, German, Chinese, Portuguese, Italian, Dutch, Danish, Finnish, Polish, Ukrainian, Russian, Turkish, Japanese, Korean, Hindi, Urdu, Indonesian, Vietnamese, Hebrew, Kurdish (Kurmanji), Sorani Kurdish, Pashto, Swahili, Amharic, Hausa, Yoruba, Igbo, Zulu, Xhosa, Somali, Kinyarwanda, and Shona. Persian, Arabic, Urdu, Hebrew, Sorani Kurdish, and Pashto use right-to-left layout. Region tags such as `fa-IR` select the available base language; unavailable translations fall back to English. Country names use locale display names. Changing language preserves routing selections and never marks a connection verified.

The renderer accepts an application-managed translation catalog using valid language tags, allowing additional language packs without changing routing code. Only installed translations appear in the selector. This is not yet all-language support across the application: full UI, errors, email templates, and recipient pages still need localization and native-speaker review. Provider/app names and network labels remain catalog names. Email-content translation is not implemented; original customer text is preserved.

When wiring the form route, treat the posted `language` as a display preference, separate from the six connection selections passed to `submitFallback`. The route must retain authentication, sender binding, and CSRF protections described above.

Persian (`fa`, including `fa-IR`) and Arabic (`ar`, including `ar-KW`) are selectable for Iran and Kuwait. Language selection is independent of country selection: multilingual customers can choose their preferred language without changing connection routing. African-language additions do not imply every African language is covered. Country-name translations depend on the locale data available in the runtime or browser.

### Exact software compatibility profiles

`ExactSoftwareConnectionCatalog` implements the automatic coordinator’s tool catalog. Every profile identifies an exact country, network, email provider, email app/browser, device platform, and software version, with a source reference and an expiring review window of at most 24 hours. Wildcard software/network matches are rejected. A new software version or a different provider stays unverified until its own profile and probes are supplied. Expired or replaced profiles cannot run previously selected probes.

Readiness now also requires an `application-installation` probe, alongside DNS/TLS, email delivery, attachment integration, upload, recipient download, and file integrity. Installing the sender application and downloading without recipient installation must be tested separately. Profile registration only chooses tools; it never establishes compatibility by itself.

These components are backend infrastructure, not a claim that every country’s software has been discovered or tested. Production still needs trusted discovery adapters, maintained exact-version catalogs, real app installation/distribution tests, and actual sender/recipient workflow probes. Recipient browser/network observations must come from the recipient or independently tested recipient environments; the sender’s country and email address cannot establish the recipient’s exact software. Large-file capacity must be tested against the actual transfer size and storage/network limits. Connection changes and software updates require new checks. No additional software should be installed on recipients to meet the download requirement.

### Built-in software reference catalog

The exact-software catalog starts with documentation references for Gmail/Google Workspace, Outlook/Microsoft 365, Apple Mail/iCloud, Yahoo Mail, AOL Mail, Proton Mail, Fastmail, SMTP submission, Android sharing, and iOS sharing. References were reviewed on 2026-10-10. Each reference carries official documentation links and adapter/account requirements. Provider IDs supplied by trusted discovery select relevant references; a country name never guesses a provider.

The same reference inventory can be consulted for Norway, Sweden, Iran, Kuwait, African countries, or another country code. This is an inventory of methods to investigate, **not** a list of services known to operate in each country. Unknown environments expose relevant references while remaining unverified. Local providers, networks, app versions, and restrictions still require discovery and exact tested profiles. Documentation references do not install or implement integrations. Large videos must use the bridge’s separately tested transport rather than assuming ordinary email attachments accept the product’s full transfer size.

### Independent automatic observation collection

`ConnectionObservationDiscovery` implements the discovery port using three request-scoped sources: network lookup (country/network), authenticated email-account metadata (provider), and client software reporting (app/platform/version). Sources run concurrently with independent two-second timeouts. A failed or malformed source leaves only its fields unknown; collected details from other sources remain available for the existing missing-field dropdown flow. Observations must be referenced and at most five minutes old. Versions without an identified app are rejected, and sources cannot set fields outside their assigned group.

Language/locale never determines country. Client software reports are routing hints until validated by the exact-profile probes. This collector does not read files or email contents. Production wiring still needs trusted network lookup configuration, account-provider metadata adapters, client collection, and sender-scoped request binding. Country/network lookup can be uncertain on VPNs or proxies, and software reports may omit full versions; those details must stay unknown rather than be invented.

### Compatibility evidence deadlines

Probe results may supply `validUntil`. The validation runner uses the earliest supplied deadline or its default evidence lifetime, whichever is sooner. Exact-software probes always cap that deadline at their profile expiration. A saved verified result therefore cannot outlive the profile that selected its tests. A malformed deadline makes that check fail; evidence that expires while later tests run is unverified when validation finishes. Adapters cannot extend the runner’s default validity by returning a later deadline.

### HTTPS download integrity probe

`HttpsDownloadIntegrityProbe` retrieves an operator-owned synthetic fixture over HTTPS and compares its exact byte count and SHA-256 digest. The configured fixture is limited to 1 MiB. The probe rejects redirects, credentials or query strings in its configured URL, mismatched environments, truncated/oversized/corrupt responses, and blocked responses. Streams are cancelled on oversize or caller cancellation. Receipts contain metadata rather than file contents or private network exception details.

A fixture probe tests byte transport from the configured vantage. It does not certify an actual recipient browser, prove a full-size transfer, or establish that a recipient needs no installation; it deliberately omits installation evidence. Those checks still require independent recipient workflow tests. The native HTTPS regression uses a local synthetic fixture and certificate trust scoped to its test subprocess, without changing system TLS policy.

### Profile withdrawal and cached readiness

Probe tools may expose a synchronous `isCurrent` guard for their configuration. The runner checks this before and after probing and retains guards for successful evidence. Each readiness assessment rechecks those evidence sources. Replacing or withdrawing an exact-software profile invalidates saved readiness immediately, even before its expiration deadline. A false or throwing guard marks the evidence unverified without exposing private adapter exceptions. This invalidation remains until new evidence is recorded; restoring a withdrawn configuration does not revive its old verified result. Profile withdrawal does not uninstall apps or modify customer files.

These guards are in-process configuration checks, not background connectivity monitoring. Production adapters must report withdrawals and configuration changes through their guards/catalog; network conditions still require fresh live probes. Persisted evidence across restarts must be revalidated against the current profile generation before reuse.
