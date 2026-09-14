# Gate 1 — userAccess Rule Validation Evidence

**Candidate:** `docs/security/firestore.rules.candidate-gate-1-userAccess`  
**Working branch:** `agent/security-employee-portal`  
**Live Firestore rules:** Gate 1 deployed and validated on 2026-09-14
**Purpose:** prove that browser create/update/delete access to `userAccess/{uid}` can be retired without breaking legitimate BizCentral workflows.

## Validation status

| Test | Evidence type | Status |
| --- | --- | --- |
| Signup creates pending `userAccess` server-side | Code inspection | PASS |
| Superadmin approve writes `userAccess` server-side | Code inspection | PASS |
| Superadmin reject writes `userAccess` server-side | Code inspection | PASS |
| Superadmin remove marks `userAccess` removed server-side | Code inspection | PASS |
| User-access synchronization writes server-side | Code inspection | PASS |
| Canonical login/session reads approved `userAccess` server-side | Code inspection | PASS |
| Browser no longer needs `userAccess` create/update/delete | Residual source sweep | PASS |
| Legitimate browser reads continue under candidate | Rule-diff inspection | PASS — candidate leaves get/list unchanged |
| Named-database automated test harness | Local test artifact | READY — `docs/security/run-gate1-named-db-test.cjs` |
| Harness JavaScript syntax | Local static execution | PASS — `node --check` |
| Emulator explicitly targets named database `biz-central` | Runtime emulator evidence | PASS — 2026-09-14 |
| Direct browser create rejected by candidate | Runtime candidate-rule test | PASS — HTTP 403 |
| Direct browser update rejected by candidate | Runtime candidate-rule test | PASS — HTTP 403 |
| Direct browser delete rejected by candidate | Runtime candidate-rule test | PASS — HTTP 403 |
| Unauthenticated `userAccess` read rejected | Runtime candidate-rule test | PASS — HTTP 403 |
| Superadmin cross-user get remains allowed | Runtime candidate-rule test | PASS — HTTP 200 |
| Superadmin browser create/update/delete rejected | Runtime candidate-rule test | PASS — HTTP 403 |
| Former bootstrap UID create/update rejected | Runtime candidate-rule test | PASS — HTTP 403 |
| Normal signup still succeeds with Gate 1 active | Production human smoke test | PASS |
| Superadmin approve and reject still succeed | Production human smoke test | PASS |
| Superadmin remove remains server-mediated | Source inspection; not repeated in production smoke | PASS — unchanged API path |
| User-access sync still succeeds | Production human smoke test | PASS |
| Normal approved session/login still succeeds | Production human smoke test | PASS |

## Static evidence

### 1. Signup

`src/app/signup/page.tsx` creates the Firebase identity and calls `POST /api/signup`; it does not write `/users` or `/userAccess` from the browser.

`src/app/api/signup/route.ts` verifies the Firebase ID token and creates both the pending `users` profile record and inert `userAccess/{uid}` record using Firebase Admin/Firestore server access.

**Result:** candidate client-write denial does not block signup.

### 2. Approve / reject / remove

`src/app/(app)/admin/users/page.tsx` sends decisions to `/api/admin/users`.

`src/app/api/admin/users/route.ts` requires canonical Superadmin authorization and performs approval, rejection and removal mutations with the server Firestore context.

**Result:** candidate client-write denial does not block user administration.

### 3. userAccess synchronization

`src/app/(app)/admin/sync-user-access/page.tsx` calls `POST /api/admin/user-access-sync`.

`src/app/api/admin/user-access-sync/route.ts` requires Superadmin authorization and writes `userAccess` with server Firestore access.

**Result:** candidate client-write denial does not block synchronization/repair.

### 4. Canonical session

`src/lib/session.ts` sends the Firebase ID token to `/api/session`. Effective BizCentral authorization is resolved server-side from canonical `userAccess/{uid}`.

**Result:** the browser does not require write authority to `userAccess` for normal session establishment.

### 5. Named database requirement

`src/lib/firebase.ts` initializes client Firestore with `getFirestore(app, 'biz-central')`; therefore Gate 1 evidence must exercise that same named database.

`docs/security/firebase.gate1-emulator.json` explicitly configures the `biz-central` database with the Gate 1 candidate rule file. Firebase documentation warns that a named database created only implicitly by an SDK/REST request can operate with open rules, so a test against `(default)` or an implicitly open `biz-central` database is invalid.

The local execution procedure is recorded in `docs/security/FIRESTORE_GATE_1_MANUAL_EMULATOR_RUNBOOK.md`.

### 6. Named-database test harness

`docs/security/run-gate1-named-db-test.cjs` now provides a bounded local emulator matrix. It hard-codes the demo project and `biz-central` database, seeds only synthetic local fixtures with Firebase Admin pointed at the emulator, and performs client-rule assertions with Auth-emulator ID tokens against the explicit named Firestore REST path.

The harness now covers 15 assertions: own-record get, cross-user and unauthenticated get denial, Superadmin cross-user get and list, ordinary-user list denial, ordinary create/update/elevation/delete denial, Superadmin create/update/delete denial, and former-bootstrap-UID create/update denial.

`node --check docs/security/run-gate1-named-db-test.cjs` passes in the available execution environment.

On 2026-09-14 the harness passed against Firebase CLI 14.22.0 and the Java 17-compatible local Emulator Suite. The run explicitly targeted `projects/demo-bizcentral-rules/databases/biz-central`; all 15 current allow/deny assertions passed. The first attempted run exposed and rejected an incorrectly resolved rules path before evidence was recorded. The emulator config was corrected to resolve the candidate rule relative to the config file, and the clean rerun loaded the candidate without an open-rules warning.

## Candidate rule effect

Only the `userAccess` mutation block changes:

```rules
allow create, update, delete: if false;
```

The existing `get` and Superadmin `list` rules remain unchanged for Gate 1.

## Runtime validation plan

Runtime tests must be executed only in the local demo emulator configuration or another explicitly approved non-production candidate-rules environment. No production credentials or live data are permitted.

### Database-target precondition

Before any PASS is recorded, prove the request target is:

`projects/demo-bizcentral-rules/databases/biz-central`

If the target is `(default)`, the run is invalid and Gate 1 remains closed.

### Positive tests

1. Create a new signup request.
   - Expected: signup succeeds.
   - Expected: canonical pending access record is created by the server.

2. Approve a pending user as Superadmin.
   - Expected: approval succeeds.
   - Expected: resulting session reflects approved role/scope.

3. Reject a separate pending user.
   - Expected: rejection succeeds.
   - Expected: rejected account cannot obtain an approved session.

4. Remove a non-Superadmin test user.
   - Expected: removal succeeds.
   - Expected: removed account loses application authorization.

5. Run user-access synchronization.
   - Expected: sync completes through the server API.

6. Sign in with a normal approved BizCentral user.
   - Expected: canonical session succeeds.

### Negative tests

1. From an authenticated client, attempt direct Firestore create on own `userAccess/{uid}`.
   - Expected: `permission-denied`.

2. Attempt direct update to change `accessLevel`, `status`, `userType`, `companyId`, or another authorization field.
   - Expected: `permission-denied`.

3. Attempt direct create/update against another UID.
   - Expected: `permission-denied`.

4. Attempt direct delete of own or another `userAccess` document.
   - Expected: `permission-denied`.

5. Verify legitimate existing client `get` of own `userAccess` still succeeds where the UI requires it.
   - Expected: success.

6. Verify Superadmin list still succeeds where currently required.
   - Expected: success.

7. Attempt client mutation using the former bootstrap UID.
   - Expected: `permission-denied`; Gate 1 removes that browser authority too.

## Runtime evidence template

- Date/time: 2026-09-14 (UTC)
- Branch SHA: `12760f7` plus the test-evidence/config correction in the subsequent commit
- Firebase CLI version: `14.22.0`
- Emulator command: `npx --yes firebase-tools@14.22.0 emulators:exec --only auth,firestore --project demo-bizcentral-rules --config docs/security/firebase.gate1-emulator.json "node docs/security/run-gate1-named-db-test.cjs"`
- Named database target proof: PASS — harness printed `projects/demo-bizcentral-rules/databases/biz-central`
- Automated positive matrix: PASS — three own/Superadmin get/list assertions returned HTTP 200
- Automated negative matrix: PASS — 12 unauthenticated/cross-user/list/create/update/elevation/delete assertions returned HTTP 403
- Server-mediated application regression matrix: PASS — completed by human production smoke test
- Production credentials/live data used: NO
- Firebase deploy executed: NO

## Production deployment evidence

- Deployment approval: Benedict explicitly approved Gate 1 on 2026-09-14.
- Deployment method: manual Firebase Console publication by Benedict to the named production database `biz-central`.
- Deployed rule delta: `userAccess` client `create`, `update` and `delete` changed to `if false`; existing `get` and Superadmin `list` permissions remained unchanged.
- Immediate smoke tests: existing login/dashboard/logout/login, new pending signup, Superadmin rejection, Superadmin approval and user-access synchronization all passed.
- Main BizCentral regression observed: none.
- Rollback required: no.

## Decision rule

Gate 1 may be recommended for live Firebase deployment only when all runtime positive and negative tests above pass against the explicitly configured `biz-central` database and Benedict gives explicit production-rule approval.

**Gate 1 status: DEPLOYED / PRODUCTION-VALIDATED / CLOSED**

**Production change:** `userAccess` browser create/update/delete denied.
**Live Firestore rules:** Gate 1 active on `biz-central`.
