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

---

## 2026-09-02 — Security Migration Step 1C / CONFIRMED CRITICAL FINDING C-001

**Severity:** CRITICAL

**Status:** PARTIALLY REMEDIATED / OPEN. Protected-app session bypass is fixed and tested. Invoice direct-write/rules weakness remains open until invoice API migration and rule tightening.

**Finding:** A Firebase-authenticated pending BizCentral user was previously able to manually navigate to protected pages and approve an invoice through a direct browser Firestore mutation.

**Root causes recorded:** legacy `/users` authorization, pending Firebase session retention, shared layout trusting legacy session, direct invoice browser write, permissive invoice rule.

**Key remediation commits:** `1fac56e5669bcb312768fb988b23e8c40503308f`; `6afa76e5187d43e468da9283666ffa8edcae7a3c`; login canonicalization `4868158fab7b7e3c33562e7c9f2f0484b96be1cb`; initialized Auth regression fix `926ad5e14291d25072c53ba4832d32e371176728`.

**Validated:** pending canonical 403; pending manual Business Performance denied; pending manual Invoice Approval denied; approved accounts retain correct view.

**Firestore rules changed:** NO.

---

## 2026-09-02 — Security Migration Step 3 — User Administration API

**Purpose:** Move user listing, lifecycle decisions and userAccess repair away from direct browser Firestore writes and behind canonical server authorization.

**Implementation:**
- User administration API: `4266f465af4ec02e9cf64c191a746a291cc08b71`.
- Server approval role validation: `84c4791aa82f9680958848d58928a7db999c4df8`.
- User Approvals UI moved to API: `0388fc5535ef1ffcc06109fc8bfd99413164db7f`.
- Server userAccess sync API: `84bad650681ae99a071699d8f386cb9ace59aae2`.
- Sync UI moved to server API: `9caa97fdeaddc985d542563553a64e2eb0e79e2e`.
- Effective `userType` and `accessLevel` are derived server-side; browser cannot grant arbitrary effective authorization.
- Superadmin self-removal and Superadmin-target removal through the lifecycle action are denied server-side.

### Authorization boundary tests

| Test | Actual | Result |
|---|---|---|
| GET missing token | 401 Unauthorized | PASS |
| GET malformed token | 401 Unauthorized | PASS |
| GET Benedict/Superadmin | 200 Authorized | PASS |
| malformed PATCH Benedict/Superadmin | 400 after authorization, no write | PASS |
| GET approved EDO | 403 Taskraft access required | PASS |
| PATCH approved EDO | 403 Taskraft access required before write | PASS |

### Approval lifecycle

Disposable test user approved as EDO associated with **2boys 2 girls** through the API-backed User Approvals page. Login succeeded; correct EDO view/company was received; manual `/admin/users` access was denied — PASS.

### userAccess sync repair

Benedict ran the API-backed User Access Sync after migration:
- Users Found: **92**
- Synced: **92**
- Skipped: **0**
- Errors: **0**

Result: PASS. Browser no longer performs the repair writes.

### Remove lifecycle

The disposable approved EDO was removed through the API-backed User Approvals page. The removed account could not subsequently enter BizCentral. However, its later login attempt failed at Firebase Authentication with invalid credentials before `/api/session` could inspect `userAccess.status=removed`. Therefore:
- server removal action: PASS;
- application access after removal: DENIED / PASS security outcome;
- specific `removed -> canonical /api/session 403` evidence: **NOT YET PROVEN** with this fixture.

Do not misclassify this as a canonical removed-status test. A controlled fixture with valid Firebase credentials must be used later if explicit removed-status 403 evidence is required.

### Reject lifecycle

A fresh disposable pending signup was rejected through the API-backed User Approvals page.
- Firebase identity remained valid and reached canonical application authorization.
- Login displayed **Access Rejected — Your BizCentral access request has been rejected.**
- Manual `/dashboard` access after rejection was blocked.
- Manual `/admin/users` access after rejection was blocked.

Result: PASS. This proves the canonical rejected-status boundary independently of Firebase Authentication.

### Step 3 conclusion

**Step 3 user administration migration is functionally complete for listing, approval, rejection, removal and userAccess repair.** Positive approval, insufficient-role denial, rejection denial, sync repair and approved-user regression paths have been validated.

**Outstanding evidence item:** explicit valid-Firebase-identity `userAccess.status=removed -> /api/session 403` remains on the security test backlog and final anomaly-closure gate. It does not block progression to Step 4 because removed application access was denied, but it must not be silently treated as tested.

**Firestore rules changed:** NO. Baseline rules remain unchanged pending later collection-by-collection tightening after replacement paths are validated.

---

## Step 4 opening audit — Signup authority

Current signup remains a legacy/high-risk migration target. The browser currently:
- creates the Firebase Authentication identity;
- writes `/users` directly;
- writes `/userAccess/{uid}` directly;
- stores requested/effective-looking access fields in the profile;
- currently derives `requestedAccessLevel` in the browser (`standard`, EDO `power_user`, Taskraft `admin`), even though the created canonical `userAccess.accessLevel` is initially `pending`.

Step 4 target: signup creates identity plus a pending request/profile only; no browser code may assign effective authorization. Canonical effective authorization remains exclusively an approval-time server decision.

---

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

**Definition of done:** There must be no known unexplained authorization anomaly remaining at final security sign-off.

**Reviewed by:** Sol

**Owner requirement:** Benedict Mahlangu explicitly required that all anomalies discovered during the upgrade be removed/resolved by the end of the security upgrade.
