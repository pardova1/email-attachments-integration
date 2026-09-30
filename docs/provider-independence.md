# Provider independence

Payment processing and production transit storage are defined behind application-owned interfaces.

## Why
- The core transfer engine must not depend on one payment processor or storage vendor.
- Providers can be replaced without changing file-integrity rules.
- Vendor credentials remain outside core domain objects and source control.

## Payment
The current product requirement is $4 USD for one year of access. Only a verified successful payment for the exact annual-license amount can activate entitlement.

## Transit storage
Production storage implementations must support multipart/resumable transfer, per-part SHA-256 metadata, completion, short-lived recipient access, and purge.

No provider adapter may resize, transcode, compress, convert, or otherwise intentionally alter user file bytes.
