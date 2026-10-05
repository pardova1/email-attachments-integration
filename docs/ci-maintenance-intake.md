# CI maintenance intake

Repository CI is the first automated enforcement point for code changes.

For pushes and pull requests targeting main, CI:
1. installs the locked dependency graph with `npm ci`;
2. compiles TypeScript;
3. runs the automated test suite.

A CI failure is classified into a structured code-maintenance issue. Build failures map to compile errors, test failures to test errors, and future security/dependency/compatibility stages map to their corresponding maintenance categories.

The Code Maintenance Supervisor then determines whether the Code Repair Agent or Code Upgrade Agent owns implementation, while the Code Research Agent remains responsible for root-cause research.

CI does not grant an agent permission to silently promote an unvalidated production change. The safe-upgrade, security, dependency-chain, private-Lane and VERIFIED EXACT gates remain mandatory.

Future CI expansion should add dependency/security scanning, integration tests, storage/database adapter tests, recipient-expiration tests, concurrency/load tests and deployment-environment validation.
