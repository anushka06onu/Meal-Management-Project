# Configuration and transaction repair

The API now uses environment configuration, positive integer quantities, monetary arithmetic in cents, row locking, guarded balance debits, and atomic registration. New customer balances start at zero; no payment or recharge workflow is implied.

Revoke the database password and JWT secret formerly committed in Git history. Configure the replacement DB_* and JWT_SECRET values before deploying. Missing configuration returns 503 while the static frontend remains available. Do not put credentials into frontend files.

`npm run setup-db` now creates MySQL tables matching the runtime and preserves existing records. It no longer creates an unrelated SQLite database. It does not migrate incompatible existing tables. Run `npm test`; validate registration, concurrency and balances against a disposable MySQL database before using real accounts.
