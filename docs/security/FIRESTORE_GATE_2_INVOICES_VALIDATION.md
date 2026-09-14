# Firestore Gate 2: invoices

## Decision

The Gate 2 candidate denies all browser SDK reads and writes to `/invoices`.
Legitimate invoice listing, creation, approval, rejection, and deletion are now
handled by the authenticated `/api/invoices` routes using the Firebase Admin
SDK and canonical `userAccess` authorization.

```text
match /invoices/{invoiceId} {
  allow read, write: if false;
}
```

The candidate is isolated in
`docs/security/firestore.rules.candidate-gate-2-invoices`. It has not been
deployed to Firebase.

The immutable original rules remain in
`docs/security/firestore.rules.current-baseline`. The latest confirmed deployed
rules are recorded separately in
`docs/security/firestore.rules.current-production`; future production rule
updates must update that rolling snapshot without changing the baseline.

## Runtime evidence

Run from the repository root with Node 20 or 22 and Java 21 available:

```powershell
npx --yes firebase-tools@14.22.0 emulators:exec --only auth,firestore --project demo-bizcentral-rules --config .\docs\security\firebase.gate2-emulator.json "node .\docs\security\run-gate2-invoices-named-db-test.cjs"
```

The harness explicitly targets the named Firestore database `biz-central`,
uses synthetic emulator-only identities and data, and requires no production
credentials.

Result recorded on 2026-09-14: **PASS (16/16 assertions)**.

- Unauthenticated get and list: denied.
- Reliever get, list, create, update, and delete: denied.
- Cross-owner reliever read: denied.
- EDO get, list, and approval update: denied.
- Superadmin get, list, approval update, and delete: denied.
- Admin SDK setup operations completed, confirming server-mediated operations
  remain available while client rules are closed.

## Release gate

Before a production Firebase rule update:

1. Review this candidate against the currently deployed rules and preserve all
   unrelated rules verbatim.
2. Repeat the named-database emulator test from a clean checkout.
3. Confirm the already migrated invoice workflows in the Employee Portal test
   preview: reliever list/create/delete and EDO or Taskraft list/decision.
4. Obtain explicit approval for the production rule deployment.

Status: **candidate runtime verified; production deployment pending review and
explicit approval**.
