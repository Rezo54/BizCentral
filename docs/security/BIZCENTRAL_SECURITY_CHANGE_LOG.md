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

**New path introduced (not yet wired into existing endpoints):**

`Bearer Firebase ID token -> verifyIdToken -> userAccess/{uid} -> require approved -> normalized AuthContext -> action-specific require* guard`

**Authorization source:** `userAccess/{uid}` only. The helper does not query `/users` and does not accept client-supplied role/company fields as authority.

**Guards introduced:** `requireAuthContext()`, `requireTaskraft()`, `requireAdmin()`, `requireSuperAdmin()`, `requireTaskraftAccountant()`, `requireEdo()`, `requireCompanyScope()`, `AuthorizationError` / `authorizationStatus()`.

**Compatibility decisions:** `super_admin` is temporarily recognized alongside canonical `superadmin`; `companyId` falls back to legacy `edoId`; Superadmin is accepted for accountant-only server operations where existing payroll rules already allow Superadmin.

**Runtime impact:** None intended. No existing API imports this helper yet. No UI code changed. No Firestore access path changed.

**Firestore rules changed:** NO.

**Netlify build:** skipped.

**Reviewed by:** Sol

**Production approval:** Not applicable at this additive foundation stage.

**Commit:** `aab4feb91e4e7ddcb8cbc55cd709138be2b9d91f`

---

## 2026-09-02 — Security Migration Step 1B

**Branch:** `employee-portal`

**Purpose:** Add and validate a minimal canonical current-user/session endpoint backed by the Step 1A server authorization helper, without replacing any existing consumer.

**New file:** `src/app/api/session/route.ts`

**Diagnostic file:** `src/app/(app)/admin/security-test/page.tsx`

**Old path:** Browser `getCurrentUser()` consumers continue to obtain session/profile authority through the legacy `/users` path. Existing APIs continue using their current authorization implementations.

**New path introduced:** `GET /api/session + Bearer Firebase ID token -> requireAuthContext() -> verified token -> approved userAccess/{uid} -> sanitized canonical user response`.

**Response fields:** `uid`, approved `status`, normalized `userType`, normalized `accessLevel`, `accountRole`, canonical/fallback `companyId`, display `name`, verified Firebase Auth `email`.

The endpoint does not return the complete `userAccess` document and does not read `/users`.

**Authorization behaviour:** missing/invalid token -> 401; no userAccess/non-approved userAccess -> 403; approved account -> 200; unexpected server failure -> 500 without internal details.

**Runtime impact:** None intended. No existing consumer has been switched to `/api/session`.

**Firestore rules changed:** NO.

**Netlify build:** skipped.

### Live Employee Mod test results

| Test | Expected | Actual | Result |
|---|---|---|---|
| Taskraft Superadmin — Benedict Mahlangu | 200, approved, taskraft, superadmin | 200, approved, taskraft, superadmin; accountRole accountant; no company scope | PASS |
| EDO — 2boysTest | 200, approved, edo, power_user, own companyId | 200, approved, edo, power_user, company `edo-2-boys-2-girls-pty-ltd` | PASS |
| Unauthenticated direct GET `/api/session` | 401 Unauthorized | `{"ok":false,"error":"Unauthorized"}` | PASS |

**Security conclusions from tests:**
- The endpoint authenticates independently of page/UI visibility.
- Effective role/type data is successfully resolved from canonical `userAccess` for both Taskraft and EDO account classes.
- EDO company scope is correctly returned from canonical authorization data.
- `accountRole` remains independent of `accessLevel`, as intended.
- No Firestore rule was modified to make these tests pass.

**Remaining negative tests before legacy session replacement:** missing userAccess, pending/rejected/removed userAccess, invalid/expired token. Additional positive role variants (Taskraft admin/standard and another EDO) should be exercised as accounts are available, but the two principal approved account classes are now proven.

**Reviewed by:** Sol

**Production approval:** Not applicable; additive endpoint/test page only.

**Implementation commits:**
- `eecbc7e89250247f4f1933158ccd06769da9258c` — canonical session endpoint.
- `3f16c29c0afe55832fc91235aba888c18eaab947` — temporary canonical session test page.

**Next checkpoint — Step 1C:** strengthen and complete the canonical session negative-test harness without altering live userAccess data, then record the results. Do not replace `getCurrentUser()` consumers until negative authorization behavior is proven.
