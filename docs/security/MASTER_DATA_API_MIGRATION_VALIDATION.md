# Master-data API migration validation

## Scope

This migration moves three existing administration workflows behind
authenticated server APIs:

- EDO company and route workbook import;
- Reliever workbook import;
- public signup-company directory synchronization.

Each endpoint validates a Firebase ID token, loads the canonical `userAccess`
record and requires an approved Taskraft `admin`, `superadmin` or
`super_admin`. Firestore writes use the Admin SDK only after this check.

## Static proof

Run from the repository root:

```powershell
node .\docs\security\run-master-data-api-migration-check.cjs
```

Expected result: `Master-data API migration static check PASS.`

The check confirms that the three migrated browser pages call their protected
API endpoints, attach a Firebase ID token, no longer import the browser
Firestore SDK, and that every endpoint uses the shared server authorization
boundary.

## Human test gate

Use synthetic or non-destructive test rows in the Netlify preview:

1. As a Taskraft admin, upload an EDO workbook and confirm the reported company,
   route and skipped-row totals.
2. Confirm the imported EDO and route appear in the existing portal views.
3. Upload a Reliever workbook and confirm its imported/skipped totals.
4. Confirm the imported Reliever appears in the existing portal view.
5. Run Signup Companies Sync and confirm the EDO and Reliever appear in signup.
6. Sign in as an ordinary approved user and directly open each of the three
   admin URLs. If the UI is reachable, the write action must still return 403.
7. Confirm existing EDO, route and Reliever records were not removed.

## Residual rule dependency

This migration does **not** make a Firebase master-data rule change ready.
`src/app/(app)/admin/companies/page.tsx` still writes directly to `/companies`,
and legitimate browser reads of companies, routes and relievers remain.

Therefore the current production rules and hard-coded UID allowlist must remain
unchanged during this PR. The next migration should move manual company
maintenance behind a protected API; only then should a collection-specific
rules candidate be prepared and emulator-tested.

Status: **implementation statically verified; Netlify human workflow test
pending; Firebase rule change not included**.
