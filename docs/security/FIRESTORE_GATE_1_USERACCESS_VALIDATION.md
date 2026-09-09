# Gate 1 — userAccess Rule Validation Evidence

**Candidate:** `docs/security/firestore.rules.candidate-gate-1-userAccess`  
**Working branch:** `agent/security-employee-portal`  
**Live Firestore rules:** unchanged  
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
| Direct browser create rejected by candidate | Runtime candidate-rule test | PENDING |
| Direct browser update rejected by candidate | Runtime candidate-rule test | PENDING |
| Direct browser delete rejected by candidate | Runtime candidate-rule test | PENDING |
| Normal signup still succeeds with candidate active | Runtime candidate-rule test | PENDING |
| Superadmin approve/reject/remove still succeeds | Runtime candidate-rule test | PENDING |
| User-access sync still succeeds | Runtime candidate-rule test | PENDING |
| Normal approved session/login still succeeds | Runtime candidate-rule test | PENDING |

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

## Candidate rule effect

Only the `userAccess` mutation block changes:

```rules
allow create, update, delete: if false;
```

The existing `get` and Superadmin `list` rules remain unchanged for Gate 1.

## Runtime validation plan

Runtime tests must be executed only in a non-production candidate-rules environment or another explicitly approved safe test environment.

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

1. From an authenticated browser, attempt direct Firestore `setDoc()` on own `userAccess/{uid}`.
   - Expected: `permission-denied`.

2. Attempt direct `updateDoc()` to change `accessLevel`, `status`, `userType`, `companyId`, or another authorization field.
   - Expected: `permission-denied`.

3. Attempt direct create/update against another UID.
   - Expected: `permission-denied`.

4. Attempt direct delete of own or another `userAccess` document.
   - Expected: `permission-denied`.

5. Verify legitimate existing browser `get` of own `userAccess` still succeeds where the UI requires it.
   - Expected: success.

6. Verify Superadmin list still succeeds where currently required.
   - Expected: success.

## Decision rule

Gate 1 may be recommended for live Firebase deployment only when all runtime positive and negative tests above pass and Benedict gives explicit production-rule approval.

Until then:

**Gate 1 status: STATICALLY VERIFIED / RUNTIME VALIDATION PENDING**  
**Production changes: NONE**  
**Live Firestore rules: UNCHANGED**
