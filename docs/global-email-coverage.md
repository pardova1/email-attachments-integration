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

### Customer-bound fallback forms

Fallback form creation and resolution require a customer scope from authenticated server context. Coordinators configured with dropdown fallback must carry that scope; constructing an unbound coordinator fails. The server binds each form to its creator and rejects another customer’s submission before looking up connection tools. Wrong-customer attempts do not modify or consume the creator’s form. The customer scope is not rendered in HTML or included in the public form model.

This is a backend API change: callers must pass the authenticated customer identifier to `prepare`/`resolve` and the coordinator constructor. Never obtain that identifier from submitted form fields or language preferences. Authenticated HTTP routes, CSRF protection, rate limits, and durable form storage remain production wiring requirements. The standalone preview is still display-only.

### Authenticated connection HTTP API

The server mounts `POST /v1/connection/check` and `POST /v1/connection/selections`. Both require bearer authentication and JSON; cookies and customer IDs in submitted bodies cannot establish identity. Check requests may include `language` and automatically collected `software` hints (`client`, `platform`, `softwareVersion`). Selection requests include `formId`, `selections`, and optional `language`. Replies localize fallback labels and country names and expose the installed language choices.

`createConnectionCheckRouter` accepts an authenticated, customer-bound coordinator factory. It verifies the returned coordinator’s scope against the authenticated customer. It passes the socket peer address and client-reported hints separately; forwarded IP headers are not trusted automatically. Request timeouts and disconnects abort the operation. Replies are not cached, and internal exceptions are masked. Browser origins require explicit operator-configured HTTPS allowlisting; this API does not enable CORS or cookie authentication.

The shipped server has no live coordinator factory yet. Authenticated connection requests therefore return unavailable rather than certifying readiness. Production must supply discovery and probe adapters, configure the browser origin, persist forms, and implement application-side authenticated JSON submission. The standalone HTML form is still a preview, not a cookie-authenticated submission route.

### Application-side connection client

`ConnectionCheckClient` sends authenticated JSON checks and fallback selections to an operator-configured HTTPS `/v1/connection` API. It gets a current access token from the application session for each request, without storing tokens or including customer identity in request bodies. Redirects and cookies are disabled. Response bodies are bounded to 128 KiB, checked against the API contract, and rejected if forms or verified evidence have expired. Invalid readiness flags, missing checks in a verified result, and malformed responses cannot produce a usable verified result.

The client exposes safe error codes for authentication, rejected requests, unavailable checks, and invalid responses. Timeouts and cancellation release pending operations and response streams. A local HTTP integration test exercises the client against the real router through a test-only transport rewrite; the shipped client requires HTTPS.

The application UI still must instantiate this client with its authenticated session, render the returned dropdown fields/language options, and call `submit` after selection. This client does not install the application, discover countries by itself, or implement live provider integrations. It introduces no new dependency; it uses the existing validation library.

### Embeddable connection form

`mountConnectionAssistance` adds a DOM form component backed by `ConnectionCheckClient`. It starts automatic checks on mount, renders only returned missing fields, submits authenticated JSON through the client, and exposes all 38 installed language packs. Persian, Arabic, Urdu, Hebrew, Sorani Kurdish, and Pashto use right-to-left layout. Changing language preserves selected IDs; changing a prerequisite clears incompatible later selections. Labels and option text are inserted as text nodes, not HTML. Focus is restored after dropdown updates.

`ConnectionFormModel` rejects expired/incomplete submissions, cancels superseded operations, ignores late responses, and aborts work on disposal. Host code receives assessment callbacks once per completed assessment and must inspect the readiness status before proceeding. Unavailable or not-ready results use the existing generic technical-difficulties notice rather than inventing customer dropdown requirements. That notice uses the selected language in all 38 installed packs.

The component is ready for embedding, but there is no published application shell or browser bundle yet. Model regression tests and TypeScript compilation cover the component logic; production browser/device validation remains pending. Integration still requires an authenticated session, HTTPS API configuration, live discovery adapters, styling, and application distribution.

### Localized connection difficulty notices

The embedded form now shows the generic technical-difficulties notice in the selected language for unavailable and not-ready results. Regional preferences normalize through the same language selector, including Persian for Iran and Arabic for Kuwait. Changing language updates the notice without changing the environment, routing, or readiness evidence. English retains the established public notice verbatim; internal exception details remain hidden.

All 38 installed connection languages have a notice. These translations still require native-speaker review. This change covers the connection form; other application screens, emails, and incident-resolution notices still need localization. Live worldwide connectivity and a downloadable application remain unverified.

### Expiring application-side readiness

The form model withdraws a verified assessment when its evidence deadline is reached or the local clock/deadline is invalid. Snapshots then report unverified status, all seven required checks, and a fresh-check requirement. The original server response is retained without mutation. Withdrawal remains in effect even if the local clock moves backward; a new successful check can restore readiness.

The embedded view schedules a refresh at the evidence deadline and delivers the changed assessment to the host callback. Language changes do not repeat an unchanged callback. Host applications must handle readiness withdrawal and retain server-side authorization checks before sending; browser timers alone cannot enforce transfer authorization, particularly when a device sleeps.

### Returning from browser suspension

The mounted form observes document visibility, window focus, and browser `pageshow` events. Returning to a visible page refreshes the model's local deadline checks, withdrawing expired verified evidence and disabling expired fallback forms even when a timer was delayed by sleep or background suspension. This also covers browser history restoration. Hidden-page events do not render unnecessary updates, and disposal removes all listeners.

Lifecycle refreshes do not infer a country, alter language/selections, or initiate network probes. A new connection check is still needed to restore expired readiness. Event/model regression tests use native event targets; testing on real mobile browsers and downloadable application shells remains pending.

### Validating dropdown dependencies on the client

The authenticated client rejects duplicate or out-of-order fields, duplicate option IDs within a field, malformed country values, and dependencies on missing/later fields or unknown prerequisite values. This prevents ambiguous selections and cyclic dropdown requirements from reaching the form. IDs may repeat across different fields because submission keys distinguish them. Dependencies satisfied by automatic discovery must already have been removed by the server.

Malformed responses remain an internal technical difficulty; the client does not invent replacement requirements or treat customer selections as verified readiness. This validation checks dependency structure, not live provider availability or every possible combination of catalog choices.

### Removing dangling server-side choices

After filtering options against automatically detected details, form preparation removes choices whose prerequisite value is no longer offered. Canonical field order propagates that removal to later dropdowns. If a required field becomes empty, the coordinator retains its internal-retry path and does not present an unusable customer form. Removed IDs cannot be submitted later. This checks missing prerequisite values; live compatibility still requires the normal connection probes.

### Request-scoped coordinator factory

`createConnectionCoordinatorFactory` supplies the HTTP router's `coordinatorFor` hook. Operators provide a discovery factory, probe catalog, and shared customer-bound fallback store. Each request gets fresh discovery using a snapshot of its authenticated scope and current request context. Forms remain available across check and selection requests through the shared store; another customer still cannot submit them. No request-bound discovery coordinator is cached. Cancelled setup cannot publish a coordinator.

The factory does not supply live network/provider discovery or probes. The shipped server remains unconfigured until those adapters are supplied. Forms and evidence remain in memory, so production restart/multi-instance durability and real provider testing are still required. Wire the factory as `coordinatorFor` in `createConnectionCheckRouter`, using operator-approved adapters and the application's authenticated session.

### Connectivity interruptions

The mounted form also observes browser `offline` and `online` events. Either event withdraws a prior verified assessment, cancels pending checks/submissions, and ignores their late replies. Returning online does not restore old evidence. A fresh successful check is required. Fallback choices tied to the prior context are discarded so they cannot be submitted after an interruption. These events are handled even while the page is hidden, and disposal removes their listeners.

Browser connectivity events are hints, not live provider probes. They do not identify countries or detect every network change (for example, changing networks while remaining online). Server-side validation and live provider testing remain necessary. No automatic retry loop is introduced.

### Browser distribution build

`npm run build` now also bundles the authenticated connection client and DOM form as a standalone ES module at `dist/browser/connection-assistance.js`. `npm run build:browser` builds it separately. The browser entry exports `ConnectionCheckClient`, `ConnectionClientError`, `mountConnectionAssistance`, and the connection language catalog/selector. It contains the necessary validation library and has no external module imports. Build-only esbuild is explicitly pinned; source maps are omitted and dependency legal notices retained.

An application can host the bundle and import its exports from a module script, construct the client with an operator-configured HTTPS API and current-session token callback, then mount the form in its own page. Never embed access tokens in the module, URLs, or HTML. The bundle does not include server adapters or service secrets.

A distribution test builds and imports the actual bundle without DOM globals, checks its language exports and HTTPS policy, and exercises an authenticated check using synthetic transport. This is an embeddable browser distribution, not an installed/downloadable app, published site, or live-provider certification. Production DOM/device verification and app packaging remain pending.

### Device-preferred starting language

When the host does not supply an explicit language, the mounted browser form selects the first supported entry in the device's ordered language preferences. Unsupported or malformed entries are skipped before considering later preferences; empty/unavailable preferences fall back to English. Explicit host language selection takes precedence, and customers can still change the selector. The standalone browser bundle exports `selectPreferredConnectionLanguage` for other host UI use.

Language preference controls presentation only. It does not determine country, email provider, network software, or readiness. The catalog still contains 38 language packs, so unsupported languages require additional translations rather than an assumed worldwide-language guarantee.

### Mounted DOM integration checks

DOM integration tests now mount the actual component with the authenticated connection client. They exercise dropdown events, prerequisite changes, right-to-left/language switching, JSON submission, assessment callback deduplication, generic failure display, hostile option text, disposal, aborted transport, and removed lifecycle listeners. The tests use the ISC-licensed linkedom package as an explicitly pinned development-only dependency. Browser builds do not include it.

This validates DOM wiring in a test implementation, not a real browser's rendering, accessibility, device behavior, or download/install workflow. Actual Android/iOS and desktop browser testing remains required before release.

### Application session integration

`mountSessionConnectionAssistance` connects the browser form to a host-supplied session adapter (`currentCustomer`, `accessToken`, `subscribe`). Signing out or switching customers cancels pending work and clears the previous result and dropdown choices. Signing in as another customer starts fresh automatic checks; token refresh for the same customer preserves the form. Tokens resolving across an account change are discarded before transport. The scope remains local and is never sent as a submitted identity.

Hosts can use `isReady()` and readiness-change callbacks to update their send controls. Readiness also becomes false on disposal, expiry, or connectivity interruption. Server-side send authorization must still enforce current identity and compatibility. The wrapper introduces no login UI or token persistence; production must supply its real authenticated session. Mounted DOM tests verify sign-out/account switching, token races, stale replies, and cleanup. The browser bundle exports this wrapper.

### Extensible worldwide language presentation

The mounted form, form model, and session wrapper now accept an operator-supplied `translations` catalog. Additional complete packs can extend the 38 defaults without changing the rendering code. Labels, direction, language options, preferred-language matching, and generic difficulty notices all use that catalog. New languages must supply their difficulty notice as well as every connection field; missing notices fail before rendering. Catalog snapshots prevent later host mutations from altering a mounted form. The Bengali text in regression tests is a synthetic host-pack example, not a shipped additional translation pack.

Worldwide support remains a release goal, not a completed certification. Country codes do not establish software compatibility; exact provider/client/platform/version discovery and live probes remain required. UI packs alone do not translate email communications or the full application, and host additions still need native-speaker review. Operators must supply complete translations, live discovery/probe adapters, and actual country/network/provider/device validation before claiming support.

### Matching server and client language catalogs

The authenticated connection router now accepts the same `translations` catalog as the browser form/session wrapper. It validates and snapshots that catalog when mounted. Fallback prompts, field/country labels, advertised language choices, and response language tags use the configured packs. Regional language requests normalize against that catalog. Unsupported languages fall back to its default without modifying country/provider selections or claiming readiness.

Deployments must supply the same reviewed catalog to the router and browser host. The bundled defaults remain 38 packs. This extends connection-API localization; application-wide screens, email communications, live provider wiring, and worldwide validation remain pending.

### API language preferences

When a JSON connection request omits `language`, the API selects the first supported language from its bounded `Accept-Language` preferences, ordered by quality weight and preserving header order for ties. Invalid ranges, wildcard ranges, and zero-quality preferences are skipped. Explicit JSON language choices take precedence. Responses with language metadata also set `Content-Language`; error codes remain generic. The parser limits header length and the number of inspected ranges.

Language negotiation changes presentation only. Tests confirm that preferred languages do not change the offered country values or bypass authenticated connection checks. Matching server/browser catalogs and complete reviewed translations are still needed for production worldwide language coverage.

### Additional African and Asian language packs

Afrikaans (`af`), Malay (`ms`), Thai (`th`), and Tamil (`ta`) bring the built-in connection catalog to 42 languages. Each includes all six field labels, prompts, language/submit controls, and the generic difficulty notice. Regional preferences such as `af-ZA`, `ms-MY`, `th-TH`, `ta-IN`, and `ta-LK` select their base pack. The standalone preview and browser/API selectors include these packs.

These are connection-interface translations, not a claim of full application/email localization or tested availability in any country. Native-speaker review and live compatibility testing remain pending. Multiple languages can be used within a country; customers retain their language choice independently of detected location and software.

### Automatic browser software hints

The session-integrated browser form now uses `BrowserConnectionCheckClient`. Each automatic check requests only `fullVersionList` from supported User-Agent Client Hints and sends recognized browser/platform metadata as client-reported hints. Explicit integration metadata takes precedence. Recognized brands are `Google Chrome` and `Microsoft Edge`; generic Chromium/unknown brands do not establish an exact app. Missing, reduced, conflicting, denied, or timed-out versions stay unknown. Collection is bounded to 500 ms and honors cancellation; late metadata cannot initiate an aborted request.

This API is not available in every browser. Source documentation: https://developer.chrome.com/docs/privacy-security/user-agent-client-hints and https://developer.mozilla.org/en-US/docs/Web/API/NavigatorUAData/getHighEntropyValues . Catalogs must use the emitted browser names and canonical platform IDs (`android`, `windows`, `macos`, `linux`, `chromeos`) to match these hints. Hints never identify country/network/email provider, certify compatibility, or establish sender identity. Other browsers/native apps need their own metadata adapters or missing-field fallback. Live discovery/probes, host session wiring, and real-device verification remain pending.

### Composing request software with server observations

`createObservedConnectionCoordinatorFactory` connects request software hints to `ConnectionObservationDiscovery` and the authenticated coordinator factory. Operators supply separate network and authenticated-provider observation adapters; software metadata is labeled `client-reported` and timestamped at request receipt. Each source runs within its own timeout. Field ownership remains enforced: request software cannot supply country/provider, network data cannot supply app/version, and provider metadata cannot supply country/network. Independent source failures preserve usable observations and offer only missing fields when the catalog permits it.

This composition does not configure a live geolocation/network lookup, connect an email account, or install provider probes. The shipped server remains unavailable until those operator adapters are wired. Client hints are untrusted routing input; source composition never bypasses connection validation. Regression tests cover source separation, retained software through fallback submission, source timeout isolation, and setup validation.

### Server connection composition

The server now mounts `createConfiguredConnectionCheckRouter`. Its optional `observations` configuration supplies the network/provider adapters, exact compatibility catalog, shared fallback store, and observation policy through `createObservedConnectionCoordinatorFactory`. HTTP options retain bearer authentication, origin policy, request deadlines, and the reviewed translation catalog. Compose once at application startup so customer-bound forms survive across requests; discovery remains fresh for each check.

Omitting `observations` preserves the unavailable response. The shipped server still omits live adapters. HTTP integration tests exercise synthetic exact-profile validation through all seven probes, unknown-version refusal, localized partial fallback and cross-customer refusal, authentication failure, and deadline cancellation. Synthetic passing probes do not establish real-country readiness. Operators must still supply and test live adapters, durable state, and matching browser/server language catalogs.

### Refreshing details on dropdown submission

Fallback submission now rediscovers the current connection before selecting probes. Previously automatic fields must still be present and agree with the form's saved context; any newly observed field must agree with the submitted environment. A changed or lost observation discards the obsolete context and resumes automatic assessment with the fresh discovery, offering only its missing fields. Choices filtered for an old country or software context cannot reach validation. Observation failure stays an internal retry. Authentication, form ownership, expiry, and choice validation precede refresh.

Selection JSON can now include the same optional `software` hints as check JSON. The browser client recollects hints for each submission; explicit native-host metadata passes through the form view/model. Older clients that omit software may need a new form or internal retry when previously automatic software cannot be refreshed. Customer selections remain unverified routing hints and never bypass probes. Regression tests cover changed/lost observations, newly complete discovery, dependent-choice invalidation, private error masking, current browser versions, and cancellation.

### Cancelling authentication with a connection request

The sender authenticator now accepts the router's abort signal and passes it into the Supabase Auth request. Cancellation releases the caller even if a transport or response parser ignores the signal; late responses cannot publish an identity, and abandoned response bodies and listeners are released. Already cancelled calls do not fetch. Failed authentication remains a rejection, and connection discovery never starts after a request deadline. Calls without a signal keep their existing API; the connection router owns its request deadline.

Tests cover pre-cancellation, stalled lookup, stalled body parsing, late response cleanup, listener removal, and HTTP deadline propagation using synthetic transports. This is resource/cancellation verification, not a live Supabase account or worldwide network test. The adapter retains the existing server-confirmed user lookup, consistent with the [Supabase getUser documentation](https://supabase.com/docs/reference/javascript/auth-getuser).

### Internal discovery failures versus unknown details

Discovery now distinguishes valid observations with unknown fields from failed, timed-out, stale, or malformed sources. Independent successful observations remain available, but source failures carry internal `retryFields` metadata and keep both checks and selection refreshes on the internal retry path. Raw source errors and retry-field metadata are not returned in the public response. A thrown discovery error no longer generates a full customer questionnaire. Subsequent checks can recover normally once the source works again.

Valid observations that omit details still offer dropdowns for the missing fields from the managed catalog. This supersedes earlier behavior described above in which source failures offered the same dropdowns as unknown details. Regression tests cover source failure isolation, timeout markers, recovery, fully unknown observations, and submission failures. This classification does not itself schedule background retries or supply live adapters.

### Bounded automatic source retries

Each discovery source now retries a thrown error or timeout once by default, with a 100 ms delay. Successful sources remain snapshotted and are not run again while another source recovers. Valid unknown details and malformed successful responses are not retried. Exhaustion keeps the generic internal retry result; it cannot create customer work or readiness. Every attempt gets a fresh timeout signal, and late timed-out results are ignored.

Operators can configure `sourceRetry` on the observed coordinator factory: `maxAttempts` is 1–3 total attempts and `delayMs` is 0–1000. The policy is validated and snapshotted at setup. Source timeouts and the enclosing coordinator/HTTP deadlines continue to bound the work. Cancellation interrupts the delay, removes its listener/timer, and prevents another attempt. This is automatic recovery within the active request; it does not create a persistent background worker or certify live connectivity.

### Complete dropdown combinations

Fallback preparation now retains a choice only if it occurs in at least one complete combination satisfying all offered prerequisites. A software version requiring an app and network that cannot coexist is removed along with earlier choices that lead only to that dead end. Multiple valid branches remain available. Removed IDs cannot be submitted. The normal probes still determine actual compatibility after selection.

The search memoizes only earlier values used by remaining prerequisites, so independent dropdowns do not require enumerating their Cartesian product. Preparation is capped at 10,000 memoized states and 50,000 option checks; exceeding either limit stays an internal retry rather than exposing an unchecked form. Tests cover contradictory dependencies, absence of a complete combination, retained valid branches, and large independent catalogs.

### Dropdown paths after each selection

The mounted browser form now uses the same bounded path search as server preparation. Each dropdown pins the already selected earlier fields and offers only choices that can still reach a complete compatible combination. This also filters options with no direct prerequisites when a later version or app makes them incompatible. Direct prerequisites must still be selected before dependent choices become available. Changing an earlier selection ignores old later selections during path search, then clears later conflicts, allowing customers to switch valid branches.

Path results are cached per field and reset on selection changes or new discovery results. Language changes preserve both choices and compatibility behavior. The model rejects forged dead-end choices, the mounted view hides/disables them, and submission remains gated by a complete compatible selection. Model/DOM tests cover indirect conflicts, branch changes, language preservation, and fresh-form cache replacement. This applies to the authenticated mounted form; the standalone HTML preview remains display-only.

### Overlapping connection checks

Each mounted connection router now admits one active check/selection per authenticated customer and up to 100 overall by default. Operators can configure `concurrency.perCustomer` from 1–10 and `concurrency.total` up to 1000, with total at least the customer limit. Limits are validated and snapshotted at mount time. Authentication, origin/content checks, and body validation precede admission; customer identity comes from authentication. Rejected excess work does not create discovery or probe operations and returns the existing generic unavailable response.

Completion, setup failure, request timeout, and disconnect release the slot in the route's cleanup. Checks and fallback selections share capacity. This bounds active requests per router instance; it is not a distributed rate limiter and cannot force an uncooperative external adapter to stop underlying work after cancellation. Production adapters must honor abort signals, and multiple instances still require deployment-wide capacity planning. HTTP regression tests cover same-customer overlap, other-customer progress, global capacity, release after timeout/failure, and invalid policies.

### Catalog-derived fallback choices

When the observed coordinator uses `ExactSoftwareConnectionCatalog`, omitting its `fallback` option now creates a shared customer-bound fallback store from that catalog. Each new form reads current profiles matching all automatically known details. Expired and withdrawn profiles cannot supply new choices; registration supplies new choices without a second manual list. Each later choice requires every earlier profile value, preserving exact combinations. Stable hashed IDs deduplicate shared prefixes and retain ordinary form identity/selection semantics.

`CustomerConnectionFallback` also accepts a synchronous choice source receiving a snapshot of the non-missing automatic details. Generated choices are validated and snapshotted per form. Existing forms retain their snapshot, but normal current-profile probe selection still prevents withdrawn/expired profiles from establishing readiness. A non-profile tool catalog still requires an explicit fallback. Labels are catalog values (country names remain localized by the HTTP/view layer); additional friendly/localized provider/software names remain future work. Profiles are operator-reviewed routing references, not proof of availability: every selection still requires all normal probes. Tests cover exact dependencies, all-known-field filtering, dynamic updates, expiry/withdrawal, snapshots, and authenticated HTTP submission.

### Fallback profile deadlines

Derived choices now carry their supporting profile expiration. Shared prefixes use the latest expiration among their matching supporting profiles. Preparation removes expired choices and dependent dead ends before generating the form. The form expires at the earlier of its ordinary 15-minute lifetime and the earliest expiration among its retained choices, conservatively refreshing the entire form when any offered branch expires. Existing browser expiry handling uses this deadline, and server submission rejects it at the deadline.

Issued forms retain their original deadline even if profiles are renewed; new forms use renewed profiles. Choices without expiration retain the ordinary form lifetime, and malformed expiration values are rejected. Withdrawal before a deadline still relies on current-profile validation and probes to prevent readiness. These changes do not supply live adapters or establish country-wide connectivity. Regression tests cover renewal, shared prefixes in both registration orders, expired-choice pruning, malformed timestamps, and the lifetime cap.

### Consistent exact environment identity

Readiness evidence and exact profile registration now trim all six connection fields, matching discovery's treatment of country, network, provider, client, platform, and software version. Country remains uppercase; other values retain case and exact version spelling. Operator profiles with incidental outer spaces therefore match trimmed discovery and produce canonical dropdown values. Different software names or versions still require separate profiles and tests.

Missing, non-string, blank, control-character, and over-256-character values are rejected before storing or assessing evidence. Only the six connection fields contribute to identity; unrelated metadata is not retained. Tests cover padded profiles and evidence, case-sensitive software distinction, malformed metadata, canonical choices, and withdrawal by canonical environment. This does not infer any country's software or replace live compatibility probes.

### Discovery boundary failures stay internal

The coordinator now validates every discovery adapter's envelope and partial environment before deciding which details are unknown. Non-string values, invalid country codes, wildcards, control characters, and values over 256 characters produce the existing generic internal retry instead of a customer dropdown. This also applies during fallback submission refresh, preventing malformed new observations from being treated as absent and replaced by older selections. Valid absent or blank details still produce only their missing dropdowns.

Accepted discovery details are copied into a six-field snapshot and normalized consistently with readiness and profiles. Tests cover malformed envelopes, malformed values with a fully configured fallback catalog, genuine unknown details, normalized prerequisite matching, and recovery of an existing form after a refresh failure. These guards do not implement a new retry worker; existing source retry policy and caller retries remain responsible for recovery.
