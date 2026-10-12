# Business plan entitlements

The $10/year Business plan adds organization-oriented functions above the same secure transfer core used by the $4/year Individual plan.

Business entitlements:
- team administration;
- centralized transfer oversight;
- business reporting;
- organization policy controls;
- audit history.

Core capabilities are **not** downgraded for Individual users. Both plans retain large-file sending, automatic recovery and final verified-exact delivery.

Business oversight must operate on transfer/service metadata needed for administration. It does not authorize administrators or research agents to inspect private video, picture or document content.

Plan-specific capabilities are enforced as explicit entitlements so future business functions can be added without creating a second transfer engine.

## Renewal payment replay protection

`RenewalService` now requires the shared `LicensePaymentApplicationRepository` used for activation. Verified payment references must match the requested reference. Paid status, the existing plan prices, and an existing license remain required. A repeated reference returns the current license without adding another year; each distinct valid payment adds one term. Callers must inject the configured repository; a missing repository fails before any license write.

Production uses the existing Supabase atomic payment-application RPC and its unique payment reference, collision checks, and transaction locks. Activation and renewal must share this durable ledger. No new database migration is required. The development memory adapter serializes applications, binds receipts to identity/plan/amount/date, saves before consuming a receipt, and returns current license state on replay. It cannot coordinate separate processes or survive restart, and the production factory still refuses a memory fallback.

Regression tests cover early/expired renewal, concurrent duplicate and distinct payments, current-state replay, failed-save retry, mismatched references, missing replay protection, and reference collisions. A rolled-back query against the connected Supabase RPC confirmed repeated application is reported as not applied and does not add a second year. No real payment was submitted. Live checkout, verified callbacks, provider credentials, and deployment remain unfinished.
