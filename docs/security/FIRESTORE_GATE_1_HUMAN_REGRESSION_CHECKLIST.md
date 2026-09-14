# Gate 1 — Human Application Regression Checklist

**Branch under review:** `agent/security-employee-portal`
**Purpose:** verify that the legitimate server-mediated `userAccess` workflows still behave normally before Gate 1 is proposed for deployment.
**Production Firestore rules:** unchanged during this test.

## Important scope note

Gate 1 changes Firestore authorization, not the Employee Portal screens. A Netlify preview alone cannot prove the candidate rules because it still connects to the currently deployed Firebase rules. The automated named-database emulator suite provides the candidate-rule proof; this checklist supplies the application/API regression evidence.

Use designated test accounts only. Do not approve, reject, remove or change a real operational user for this test.

## Record before starting

- Test URL:
- Branch/commit shown by deployment:
- Tester:
- Date and time:
- Designated Superadmin test account:
- Designated ordinary test account:
- Designated disposable signup account:

## Test 1 — Existing approved-user login

1. Sign in with the designated approved ordinary BizCentral user.
2. Confirm the dashboard loads normally.
3. Confirm the user sees only the pages expected for that role and company.
4. Sign out and sign in again.

**Pass:** both sessions are established normally and the effective role/company scope is unchanged.

Result: PASS / FAIL
Notes:

## Test 2 — New signup creates a pending request

1. Register the disposable signup account through the normal signup page.
2. Sign in as the designated Superadmin.
3. Open Admin → Users.
4. Confirm the new account appears as pending with the expected user type, company and requested role.
5. Confirm the pending account cannot enter approved application areas before approval.

**Pass:** signup succeeds, the pending record appears, and no authority is granted prematurely.

Result: PASS / FAIL
Notes:

## Test 3 — Superadmin approval

1. Approve the disposable pending account through Admin → Users.
2. Sign out of the Superadmin account.
3. Sign in with the newly approved account.
4. Confirm its permitted pages match the approved role and company.

**Pass:** approval succeeds through the normal UI and the approved session reflects the intended scope.

Result: PASS / FAIL
Notes:

## Test 4 — User-access synchronization

1. Sign in as the designated Superadmin.
2. Open Admin → Sync User Access.
3. Run the normal synchronization action.
4. Confirm the operation completes without a permission error.
5. Recheck that the designated ordinary user can still sign in with unchanged scope.

**Pass:** synchronization completes server-side and does not disrupt a legitimate approved user.

Result: PASS / FAIL
Notes:

## Test 5 — Rejection

1. Create a second disposable signup account.
2. Confirm it appears as pending.
3. Reject it through Admin → Users.
4. Attempt to sign in with the rejected account.

**Pass:** rejection succeeds and the rejected account cannot obtain an approved application session.

Result: PASS / FAIL
Notes:

## Test 6 — Removal and session revocation

1. While signed in as the first disposable approved account, open a normal permitted page.
2. In a separate Superadmin session, remove that disposable account.
3. Refresh or navigate in the disposable account session.
4. Attempt a fresh sign-in with the removed account.

**Pass:** removal succeeds, the existing session loses application authority, and a fresh approved session cannot be established.

Result: PASS / FAIL
Notes:

## Stop conditions

Stop and record a failure if any of the following occurs:

- signup, approval, rejection, removal or sync returns a permission error;
- a pending, rejected or removed user receives approved access;
- a removed user's existing session remains authorized after refresh/navigation;
- an ordinary user receives Superadmin or cross-company scope;
- the test requires changing a real operational account.

## Completion decision

Gate 1 is ready for the explicit production-rule decision only when:

- all six human regression tests pass;
- the 15-case named-database emulator suite remains green;
- the exact candidate rule diff is reviewed;
- Benedict explicitly approves the production Firebase rule deployment.

No result in this checklist authorizes a merge or Firebase deployment by itself.
