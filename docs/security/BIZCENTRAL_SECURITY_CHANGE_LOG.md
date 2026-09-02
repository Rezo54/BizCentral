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

**Old path:** Existing APIs each implement their own Firebase ID-token verification and `userAccess` lookup. Existing browser/session/UI paths remain unchanged.

**New path introduced (not yet wired into existing endpoints):** `Bearer Firebase ID token -> verifyIdToken -> userAccess/{uid} -> require approved -> normalized AuthContext -> action-specific require* guard`.

**Authorization source:** `userAccess/{uid}` only. The helper does not query `/users` and does not accept client-supplied role/company fields as authority.

**Guards introduced:** `requireAuthContext()`, `requireTaskraft()`, `requireAdmin()`, `requireSuperAdmin()`, `requireTaskraftAccountant()`, `requireEdo()`, `requireCompanyScope()`, `AuthorizationError` / `authorizationStatus()`.

**Compatibility decisions:** `super_admin` is temporarily recognized alongside canonical `superadmin`; `companyId` falls back to legacy `edoId`; Superadmin is accepted for accountant-only server operations where existing payroll rules already allow Superadmin.

**Runtime impact:** None intended. No existing API imports this helper yet. No UI code changed. No Firestore access path changed.

**Firestore rules changed:** NO. **Netlify build:** skipped. **Reviewed by:** Sol. **Commit:** `aab4feb91e4e7ddcb8cbc55cd709138be2b9d91f`.

---

## 2026-09-02 — Security Migration Step 1B

**Purpose:** Add and validate `/api/session` backed by canonical `userAccess`, without replacing existing consumers.

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

**Status:** OPEN — must be eliminated and regression-tested before the security upgrade is considered complete.

**Finding:** An authenticated Firebase user whose BizCentral account is still pending approval was able to manually navigate to the Reliever Invoice Approval page and successfully approve an invoice.

**Observed test path:**
1. A new test user was created through the normal application workflow and deliberately left unapproved.
2. Login with correct credentials authenticated the Firebase identity, then the legacy login UI displayed `Your account is waiting approval`.
3. The pending Firebase session remained authenticated.
4. `/api/session` correctly rejected that same identity with HTTP 403 `User access is not approved` — canonical server authorization PASS.
5. The pending user manually opened the invoice approval page.
6. The legacy invoice page obtained authority from `src/lib/session.ts` / `/users`, which does not require approved status.
7. The page allowed the invoice approval action and the direct Firestore `updateDoc()` succeeded.

**Confirmed root causes:**
- authentication and authorization are conflated in legacy browser paths;
- failed/pending application login leaves the Firebase identity signed in;
- legacy `getCurrentUser()` reads `/users` and does not enforce approved `userAccess.status`;
- invoice approval is a direct browser Firestore mutation;
- the baseline invoice rule permits an approval/status-field mutation without sufficiently restricting the actor.

**Immediate migration implications:**
- Add defensive sign-out when login discovers missing/non-approved application access. This is defense-in-depth only, not the final authorization fix.
- Continue canonical session migration; do not treat UI navigation guards as security.
- Bring invoice server/API migration forward as the first business-state module after the canonical identity/user-administration foundation is safe enough to support it.
- Invoice approval/rejection must be authorized server-side and must derive actor, EDO/company scope, timestamps and permitted state transition on the server.
- Invoice Firestore client writes must ultimately be denied after API migration and tests.

### Mandatory anomaly-elimination completion gate

The BizCentral security upgrade SHALL NOT be declared complete merely because planned migration steps have been implemented. Before final sign-off, Sol and Benedict Mahlangu must perform a dedicated **Security Anomaly Closure Audit** across the active application and rules.

Completion requires all of the following:
1. Every Critical/High/Legacy/Transitional finding in the Audit, Matrix and Change Log is marked `CLOSED`, `ACCEPTED WITH DOCUMENTED RATIONALE`, or explicitly deferred by Benedict with a recorded reason. No unexplained anomaly may remain.
2. Search the active branch for remaining direct privileged Firestore/Storage mutations (`addDoc`, `setDoc`, `updateDoc`, `deleteDoc`, `writeBatch`, client upload/delete operations) and classify every occurrence. Privileged/business-state writes must be server-authorized unless explicitly justified.
3. Search for all remaining consumers of legacy `getCurrentUser()`, `/users` role/access fields, `src/lib/acess.ts`, legacy role aliases, hard-coded privileged UIDs and client-side role checks used as authority. Remove or reclassify presentation-only uses.
4. Verify every protected API independently rejects unauthenticated, missing-userAccess, pending/rejected/removed and insufficient-role callers.
5. Verify cross-company/ownership isolation, including EDO A -> EDO B denial, manipulated IDs, and staff route/schedule scope.
6. Verify sensitive state transitions (invoice approval, leave review, attendance, employee master, rates, crate imports, payroll/imports, user approval) cannot be performed by manually entering a URL or directly calling Firestore from an authenticated but unauthorized browser.
7. Re-audit the final Firestore rules collection-by-collection against the final application paths; ensure old client writes are denied after their API migrations.
8. Remove temporary security diagnostic/test endpoints/pages or explicitly secure and retain them.
9. Run regression tests for approved users so hardening does not break legitimate workflows.
10. Produce a final closure report listing every discovered anomaly, remediation commit, rule change, test evidence and final disposition.

**Definition of done:** There must be no known unexplained authorization anomaly remaining at final security sign-off. A working UI is not evidence of security; the server/API and final rules must enforce the intended authorization independently.

**Firestore rules changed during discovery:** NO.

**Production data note:** The test demonstrated a real invoice approval mutation. The affected test invoice/action should be identified and reversed/cleaned up through an authorized account if it was not intended to remain approved; do not hide the evidence from the audit log if an audit record exists.

**Reviewed by:** Sol

**Owner requirement:** Benedict Mahlangu explicitly required that this Critical finding be noted and that all anomalies discovered during the upgrade be removed/resolved by the end of the security upgrade.
