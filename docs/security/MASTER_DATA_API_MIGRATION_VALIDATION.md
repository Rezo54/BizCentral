# Master-data API migration validation

## Scope

This migration moves four existing administration workflows behind
authenticated server APIs:

- generic Company workbook import;
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

The check confirms that the four migrated browser pages call their protected
API endpoints, attach a Firebase ID token, no longer import the browser
Firestore SDK, and that every endpoint uses the shared server authorization
boundary.

## Human test gate

The EDO, Reliever and Signup Companies workflows passed human validation on
2026-09-15. For the generic Company import, use a known current workbook or a
non-destructive existing record in the Netlify preview:

1. As a Taskraft admin, upload a Company workbook and confirm the reported
   imported and skipped-row totals.
2. Confirm that existing fields on a matching Company record are preserved.
3. Sign in as an ordinary approved user and directly open the Company upload
   URL. If the page is reachable, the upload action must still return 403.
4. Upload a workbook with one data row and invalid headers; the API must report
   that no valid Company rows were found.
5. Regression-check the already validated EDO workbook and confirm the reported company,
   route and skipped-row totals.
6. Confirm existing EDO, route, Reliever and Company records were not removed.

## Residual rule dependency

After this migration, the four master-data administration pages no longer
write directly to Firestore. Legitimate browser reads of companies, routes and
relievers remain, so their read permissions cannot yet be removed.

This PR does not change Firebase rules. Once its Company import workflow passes
human validation, a separate collection-specific candidate may deny browser
writes to companies, routes and relievers while preserving their required read
rules. That candidate must be emulator-tested before any production rule
update.

Status: **original three workflows human-validated; Company import validation
pending; Firebase rule change not included**.
