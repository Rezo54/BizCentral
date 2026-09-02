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

**Guards introduced:**
- `requireAuthContext()`
- `requireTaskraft()`
- `requireAdmin()`
- `requireSuperAdmin()`
- `requireTaskraftAccountant()`
- `requireEdo()`
- `requireCompanyScope()`
- `AuthorizationError` / `authorizationStatus()`

**Compatibility decisions:**
- `super_admin` is temporarily recognized alongside canonical `superadmin` because legacy data/code still contains both forms. This alias will be removed only after authorization data is normalized.
- `companyId` falls back to legacy `edoId` while migration is in progress.
- Superadmin is accepted for accountant-only server operations where existing payroll rules already allow Superadmin.

**Runtime impact:** None intended. No existing API imports this helper yet. No UI code changed. No Firestore access path changed.

**Firestore rules changed:** NO.

**Netlify build:** skipped via commit message.

**Tests/checks performed before commit:**
- Re-read Security Migration Audit v1 and Rules Migration Matrix v1.
- Re-read active `employee-portal` branch head before implementation.
- Re-read `src/lib/firebase-admin.ts` to ensure helper reuses the existing named Admin app and `biz-central` Firestore database.
- Compared helper design with the existing `/api/month-end` and `/api/admin/messages` authorization patterns.
- Confirmed helper distinguishes missing/invalid authentication (401) from missing/unapproved/insufficient authorization (403).
- Confirmed helper requires `userAccess.status == approved` centrally; this is stricter and more consistent than several existing duplicated API contexts, but it is not wired into them yet, so no current behaviour changes.
- Confirmed no deployed rules file was modified.

**Reviewed by:** Sol

**Production approval:** Not applicable at this additive foundation stage; no production security/rules change.

**Commit:** `aab4feb91e4e7ddcb8cbc55cd709138be2b9d91f`

---

## 2026-09-02 13:11 SAST — Security Migration Step 1B

**Branch:** `employee-portal`

**Purpose:** Add a minimal canonical current-user/session endpoint backed by the Step 1A server authorization helper, without replacing any existing consumer.

**New file:** `src/app/api/session/route.ts`

**Old path:** Browser `getCurrentUser()` consumers continue to obtain session/profile authority through the legacy `/users` path. Existing APIs continue using their current authorization implementations.

**New path introduced:**

`GET /api/session + Bearer Firebase ID token -> requireAuthContext() -> verified token -> approved userAccess/{uid} -> sanitized canonical user response`

**Response intentionally exposes only current-user fields needed for later UI migration:**
- `uid`
- approved `status`
- normalized `userType`
- normalized `accessLevel`
- `accountRole`
- canonical/fallback `companyId`
- display `name`
- verified Firebase Auth `email`

The endpoint does not return the complete `userAccess` document and does not read `/users`.

**Authorization behaviour:**
- missing Bearer token -> 401;
- invalid/expired Firebase token -> 401;
- no `userAccess` record -> 403;
- non-approved `userAccess` -> 403;
- approved account -> 200 with canonical current-user data;
- unexpected server failure -> 500 without leaking internal error details.

**Runtime impact:** None intended. No page, component, session helper or existing API has been switched to `/api/session` in Step 1B.

**Firestore rules changed:** NO.

**Netlify build:** skipped via commit message.

**Checks performed before implementation:**
- Re-read Security Migration Audit v1.
- Re-read Rules Migration Matrix v1.
- Re-read Security Change Log and Step 1A checkpoint.
- Re-read `src/lib/server-authorization.ts` from the active branch.
- Confirmed the endpoint consumes the canonical helper rather than duplicating token/userAccess logic.
- Confirmed it does not accept role/company/status from query parameters or request body.
- Confirmed it is GET-only and does not mutate Firestore.
- Confirmed no legacy consumer is removed or changed.

**Testing status:** Structural/code review completed. Live role tests require running Employee Mod with valid Firebase ID tokens for the test accounts. Before replacing `getCurrentUser()`, test at minimum: Taskraft superadmin/admin/standard, EDO A, EDO B, pending/rejected account, missing token and invalid token.

**Reviewed by:** Sol

**Production approval:** Not applicable; additive endpoint only, no production rule or existing workflow change.

**Next checkpoint:** Test `/api/session` locally in Employee Mod with representative accounts. Do not migrate legacy `getCurrentUser()` consumers until those positive/negative tests are recorded as passed.
