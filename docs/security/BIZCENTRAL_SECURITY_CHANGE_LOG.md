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

**Validated:** Superadmin positive boundary, approved EDO 403 boundary, approval as 2boys 2 girls EDO, rejection and protected-route denial, removal security outcome, and API-backed userAccess repair (92 found / 92 synced / 0 skipped / 0 errors).

**Outstanding evidence item:** explicit valid-Firebase-identity `userAccess.status=removed -> /api/session 403` remains on the final test backlog because the removed fixture failed Firebase Authentication first.

**Firestore rules changed:** NO.

---

## 2026-09-02 — Security Migration Step 4 — Signup Authority Cleanup

**Purpose:** Ensure registration can request access but cannot grant effective BizCentral authorization.

**Implementation:**
- `src/app/api/signup/route.ts` added in commit `c374afefe24fa6c310e2bb9dfe41ad70bc1cefa5`.
- Signup UI moved to that API in commit `723fcad72e7a053afab0a845c97859d94bb3d946`.
- Browser no longer writes `/users` or `/userAccess` during signup.
- Browser no longer calculates or submits effective `standard`, `power_user` or `admin` authorization.
- Firebase Authentication still creates the identity client-side; the resulting ID token is sent to `/api/signup`.
- Signup API verifies the Firebase token and verifies submitted email matches the authenticated token email.
- For EDO/Reliever registrations, server independently validates the selected active `signupCompanies` document and its type/sourceId.
- Server creates a pending `/users` workflow/profile record and an inert canonical `/userAccess/{uid}` record with `status=pending` and `accessLevel=pending`.
- Effective `userType` and `accessLevel` are introduced only later by the Superadmin approval API.
- Signup signs the newly created Firebase identity out after the pending request has been created.

### Step 4 live validation

A fresh disposable EDO signup was created through the normal Create Account flow and associated with **2boys 2 girls**.

| Test | Expected | Actual | Result |
|---|---|---|---|
| Normal signup | Pending account created | Account created; Await admin approval | PASS |
| Post-signup Firebase session | Signed out | Returned to login without retained app session | PASS |
| Immediate login before approval | Canonical pending denial | Access Pending | PASS |
| Manual `/dashboard` before approval | Denied | Blocked | PASS |
| Superadmin User Approvals listing | Pending request visible with intended company | Present and associated with 2boys 2 girls | PASS |
| Superadmin approval as EDO | Server introduces effective authority | Approval successful | PASS |
| Login after approval | Approved EDO session | Login successful | PASS |
| Company scope after approval | 2boys 2 girls EDO view only | Correct EDO/company view | PASS |
| Manual `/admin/users` after approval | Denied | Blocked | PASS |
| Normal EDO functionality | Remains available | Available | PASS |

### Step 4 conclusion

**STEP 4 PASSED.** Signup is now a request boundary, not an authorization boundary. Selecting Taskraft/EDO/Reliever and a company during registration does not activate corresponding permissions. Canonical effective authority is introduced only by the server-authorized Superadmin approval path.

**Remaining future hardening:** later Firestore rule tightening should remove the now-obsolete browser signup write permissions to `/users` and `/userAccess`. Until that rules phase, the deployed baseline rules remain unchanged by design.

**Firestore rules changed:** NO.

---

## 2026-09-02 — Security Migration Step 5 — Employee Master

**Purpose:** Move privileged employee-master create, edit and bulk-import writes from browser Firestore mutations to canonical server-authorized APIs while preserving existing People workflows.

**Implementation:**
- Add Employee API: `src/app/api/admin/employees/route.ts`, commit `24f45cc`.
- Add Employee UI migrated from direct `setDoc()` to authenticated API, commit `878534d`.
- Edit Employee API: `src/app/api/admin/employees/[employeeId]/route.ts`, commit `f1a803e`.
- Edit Employee UI migrated from direct `updateDoc()` to authenticated API, commit `4200a0d`.
- Bulk Employee API: `src/app/api/admin/employees/bulk/route.ts`, commit `7e53531`.
- Bulk Employee UI migrated from direct Firestore batch/write behaviour to authenticated API, commit `3a4f36d`.
- Employee Master boundary tests added to temporary security diagnostic, commit `69d13bc`.

**Server boundary:** all three mutation APIs require canonical approved `userAccess` and Taskraft Admin/Superadmin authorization before Admin SDK writes. Server independently owns employee ID generation, trusted company metadata, validation and audit timestamps. Add Employee duplicate prevention is authoritative server-side. Edit preserves employee code/company identity instead of trusting client-supplied scope. Bulk upload revalidates every row server-side and resolves EDO company metadata from Firestore.

### Step 5 live validation

| Test | Expected | Actual | Result |
|---|---|---|---|
| Taskraft Admin — Add Employee | Create through API | Temporary `SEC001` employee created | PASS |
| Add duplicate employee code in same EDO | Server rejects duplicate | `Employee Code already exists for this EDO business` | PASS |
| Taskraft Admin — Edit Employee | Update through API | `SEC001` successfully edited | PASS |
| Taskraft Admin — Bulk Employee Upload | Existing master updates without duplicate creation | 237 processed; 0 created; 237 updated | PASS |
| Approved EDO direct API attack — Create | 403, no employee created | 403 `Taskraft access required` | PASS |
| Approved EDO direct API attack — Edit | 403, employee unchanged | 403 `Taskraft access required` | PASS |
| Approved EDO direct API attack — Bulk | 403, no bulk employee created | 403 `Taskraft access required` | PASS |

### Step 5 conclusion

**STEP 5 APPLICATION/API MIGRATION PASSED.** The known privileged Employee Master write paths now use the canonical server authorization boundary and an authenticated EDO cannot bypass the UI to call those APIs.

**Rules status:** Firestore rules remain unchanged by design. Employee rules are therefore **not yet finally hardened/closed**; collection-level browser-write denial is deferred to the rule-tightening gate after replacement-path verification. Final anomaly closure must also search the active branch for any additional employee mutation path not covered above.

**Test fixture:** `SEC001` may be removed after it is no longer needed for security regression testing.

---

### Priority security work after Step 5 — C-001 Invoice Security

C-001 remains **OPEN** because the invoice approval/rejection page still contains direct browser Firestore state mutation and the baseline invoice rules contain a permissive status/approval update branch. The next priority is to move invoice approval/rejection behind canonical server authorization, validate business-state transitions and ownership/scope, switch the UI, run direct-call negative tests, and then prepare the invoice-specific Firestore rule tightening gate.

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
