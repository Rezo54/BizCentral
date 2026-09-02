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

**Next checkpoint:** Fetch and re-read this change log plus Audit and Matrix before Step 1B. Step 1B should introduce a minimal server session/current-user endpoint using this helper, initially without replacing legacy `getCurrentUser()` consumers.
