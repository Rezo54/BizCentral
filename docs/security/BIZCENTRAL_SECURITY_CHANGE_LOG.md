# BizCentral Security Change Log

Project owner / production approval: Benedict Mahlangu
Security architecture / technical review: Sol (OpenAI GPT-5.6 Sol)
Companion documents:
- `BIZCENTRAL_SECURITY_MIGRATION_AUDIT_V1.md`
- `BIZCENTRAL_RULES_MIGRATION_MATRIX_V1.md`
- `firestore.rules.current-baseline`

## 2026-09-02 13:11 SAST — Security Migration Step 1A

**Branch:** `employee-portal`

**Purpose:** Add the common server-side authorization foundation without changing any existing runtime path or deployed Firestore rule.

**New file:** `src/lib/server-authorization.ts`

**New path introduced:** `Bearer Firebase ID token -> verifyIdToken -> userAccess/{uid} -> require approved -> normalized AuthContext -> action-specific require* guard`.

**Authorization source:** `userAccess/{uid}` only. The helper does not query `/users` and does not accept client-supplied role/company fields as authority.

**Guards introduced:** `requireAuthContext()`, `requireTaskraft()`, `requireAdmin()`, `requireSuperAdmin()`, `requireTaskraftAccountant()`, `requireEdo()`, `requireCompanyScope()`, `AuthorizationError` / `authorizationStatus()`.

**Firestore rules changed:** NO. **Netlify build:** skipped. **Reviewed by:** Sol. **Commit:** `aab4feb91e4e7ddcb8cbc55cd709138be2b9d91f`.

---

## 2026-09-02 — Security Migration Step 1B

**Purpose:** Add and validate `/api/session` backed by canonical `userAccess`, without initially replacing existing consumers.

**Files:** `src/app/api/session/route.ts`; diagnostic `src/app/(app)/admin/security-test/page.tsx`.

**Live Employee Mod test results:**

| Test | Expected | Actual | Result |
|---|---|---|---|
| Taskraft Superadmin — Benedict Mahlangu | 200, approved, taskraft, superadmin | 200, approved, taskraft, superadmin; accountant | PASS |
| EDO — 2boysTest | 200, approved, edo, power_user, own companyId | 200, approved, edo, power_user, `edo-2-boys-2-girls-pty-ltd` | PASS |
| Unauthenticated | 401 | 401 Unauthorized | PASS |

**Implementation commits:** `eecbc7e89250247f4f1933158ccd06769da9258c`; `3f16c29c0afe55832fc91235aba888c18eaab947`.

---

## 2026-09-02 — Security Migration Step 1C / CONFIRMED CRITICAL FINDING C-001

**Severity:** CRITICAL

**Status:** PARTIALLY REMEDIATED / OPEN. The protected-app session bypass demonstrated below is fixed and tested. The underlying invoice direct-write/rules weakness remains open until the invoice API migration and relevant Firestore rule tightening are complete.

**Finding:** An authenticated Firebase user whose BizCentral account was still pending approval was able to manually navigate to the Reliever Invoice Approval page and successfully approve an invoice.

**Observed exploit path:**
1. A new test user was created normally and deliberately left unapproved.
2. Correct credentials authenticated Firebase; legacy login displayed the pending message.
3. The pending Firebase session remained authenticated.
4. `/api/session` correctly rejected the identity with HTTP 403.
5. The pending user could nevertheless manually open protected app pages, including Business Performance and Reliever Invoice Approval, because the shared protected layout still used legacy `getCurrentUser()` authority from `/users`.
6. The invoice approval page then performed a direct Firestore `updateDoc()` and the unauthorized approval succeeded.
7. Benedict Mahlangu manually restored the affected test invoice to its intended unapproved/pending business state after the test. The security evidence remains recorded.

**Confirmed root causes:**
- authentication and application authorization were conflated in legacy browser paths;
- failed/pending application login could leave Firebase identity signed in;
- legacy `getCurrentUser()` read `/users` without enforcing approved canonical `userAccess.status`;
- the shared `(app)` layout trusted that legacy helper;
- invoice approval is still a direct browser Firestore mutation;
- the baseline invoice rule permits an approval/status-field mutation without sufficiently restricting the actor.

### Step 1C defensive changes

**Commit `1fac56e5669bcb312768fb988b23e8c40503308f` — `Sign out unauthorized login sessions [skip netlify]`:**
- login now calls Firebase `signOut(auth)` when the legacy profile is missing or status is not approved;
- classified as defense-in-depth only, not sufficient authorization by itself.

The first retest after this login-only change still demonstrated protected-page access. This proved that fixing only the login UI was insufficient and that the common protected application session boundary also had to migrate.

**Commit `6afa76e5187d43e468da9283666ffa8edcae7a3c` — `Use canonical API for current session [skip netlify]`:**
- `src/lib/session.ts` no longer queries `/users` to determine the current protected-app authority;
- it obtains the Firebase ID token and calls `/api/session`;
- `/api/session` resolves effective authorization from approved `userAccess/{uid}`;
- a 401/403 response returns no application session and signs out the Firebase browser identity as defense-in-depth;
- existing `getCurrentUser()` consumers therefore begin using the canonical authorization source without a global UI rewrite.

### Step 1C negative and regression test evidence

| Test | Expected | Actual | Result |
|---|---|---|---|
| Missing Authorization token | 401 | 401 Unauthorized | PASS |
| Malformed Bearer token | 401 | 401 Unauthorized | PASS |
| Wrong Authorization scheme | 401 | 401 Unauthorized | PASS |
| Valid Firebase identity with pending BizCentral access | 403 from canonical API / no protected application access | Canonical API rejected; after session migration pending account has no access to protected pages | PASS |
| Pending account manually opens `/business-performance` | Page must not render | No access | PASS |
| Pending account manually opens `/invoicing/reliever/approve` | Page must not render | No access | PASS |
| Approved account normal login | Must retain correct authorized application view | Login succeeds with correct view | PASS |

**Step 1C conclusion:** Canonical approved-status enforcement is now proven at the shared protected-app session boundary. Pending Firebase identities can no longer use the tested manual-URL path to enter BizCentral protected pages. This does NOT close C-001 completely because direct invoice business-state mutation and permissive invoice Firestore rules remain to be migrated and tightened.

**Remaining session-edge tests:** naturally available rejected/removed account and valid Firebase identity with missing `userAccess` should be tested when safe fixtures/accounts are available. Do not damage approved production accounts merely to create these cases.

**Firestore rules changed:** NO.

### Mandatory anomaly-elimination completion gate

The BizCentral security upgrade SHALL NOT be declared complete merely because planned migration steps have been implemented. Before final sign-off, Sol and Benedict Mahlangu must perform a dedicated **Security Anomaly Closure Audit** across the active application and rules.

Completion requires all of the following:
1. Every Critical/High/Legacy/Transitional finding in the Audit, Matrix and Change Log is marked `CLOSED`, `ACCEPTED WITH DOCUMENTED RATIONALE`, or explicitly deferred by Benedict with a recorded reason. No unexplained anomaly may remain.
2. Search the active branch for remaining direct privileged Firestore/Storage mutations (`addDoc`, `setDoc`, `updateDoc`, `deleteDoc`, `writeBatch`, client upload/delete operations) and classify every occurrence. Privileged/business-state writes must be server-authorized unless explicitly justified.
3. Search for all remaining consumers of legacy authority, `/users` role/access fields, `src/lib/acess.ts`, legacy role aliases, hard-coded privileged UIDs and client-side role checks used as authority. Remove or reclassify presentation-only uses.
4. Verify every protected API independently rejects unauthenticated, missing-userAccess, pending/rejected/removed and insufficient-role callers.
5. Verify cross-company/ownership isolation, including EDO A -> EDO B denial, manipulated IDs, and staff route/schedule scope.
6. Verify sensitive state transitions cannot be performed by manually entering a URL or directly calling Firestore from an authenticated but unauthorized browser.
7. Re-audit final Firestore rules collection-by-collection against final application paths; old client writes must be denied after API migrations.
8. Remove temporary security diagnostic/test endpoints/pages or explicitly secure and retain them.
9. Run regression tests for approved users so hardening does not break legitimate workflows.
10. Produce a final closure report listing every discovered anomaly, remediation commit, rule change, test evidence and final disposition.

**Definition of done:** There must be no known unexplained authorization anomaly remaining at final security sign-off. A working UI is not evidence of security; the server/API and final rules must enforce the intended authorization independently.

**Reviewed by:** Sol

**Owner requirement:** Benedict Mahlangu explicitly required that this Critical finding be noted and that all anomalies discovered during the upgrade be removed/resolved by the end of the security upgrade.
