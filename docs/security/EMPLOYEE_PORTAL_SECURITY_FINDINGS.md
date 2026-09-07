# Employee Portal Security Findings

## Cycle #1

### EP-SEC-001 — Stale staff sessions
**Severity:** High  
**Status:** Remediated on agent branch / accepted baseline.  
Staff sessions revalidate portal access and reject stale, deactivated, relinked or mismatched employee/EDO identities.

### EP-SEC-002 — Activation ID-verifier throttling
**Severity:** High  
**Status:** Remediated on agent branch / accepted baseline.  
Failed ID-suffix verification is transactionally throttled independently of OTP counters.

### EP-SEC-003 — Full national ID returned by staff profile
**Severity:** Medium  
**Status:** Remediated on agent branch / accepted baseline.  
Staff profile returns only the masked/final-four ID representation.

### EP-SEC-004 — Unauthenticated Firebase Admin diagnostic route
**Severity:** High  
**Status:** Remediated on agent branch / accepted baseline.  
Historical diagnostic route is closed and no longer exposes privileged connectivity/error information.

---

## Security Cycle #2

### EP-SEC-006 — Activation completion not bound to successful employee ID verification
**Severity:** High  
**Status:** Remediated on `agent/security-employee-portal`; Deploy Preview/regression verification pending.  
**Scope:** `src/app/api/staff/activation/check/route.ts`, `src/app/api/staff/activation/complete/route.ts`

Successful employee/ID verification now creates a cryptographically random, short-lived activation proof. Only its SHA-256 hash and expiry are stored in the existing `employeePortalAccess` document. The raw proof is held in an HttpOnly, SameSite cookie. Activation completion requires both a valid Firebase phone ID token and the matching unexpired proof, then consumes the proof atomically with activation. Expired, mismatched and replayed proofs fail.

**Verification:** successful activation; missing proof rejected; expired proof rejected; replay rejected; Firebase phone must match portal record; existing OTP and ID throttling still works.

### EP-SEC-007 — Persistent payslip storage URL bypasses Employee Portal session boundary
**Severity:** High  
**Status:** Remediated on `agent/security-employee-portal`; Deploy Preview/regression verification pending.  
**Scope:** `src/app/api/staff/payslips/route.ts`, `src/app/staffportal/payslips/page.tsx`

The browser-facing payslip list no longer exposes the persistent Firebase Storage URL. Downloads pass through the authenticated Employee Portal API, which validates the active staff session and payslip ownership, resolves the existing `pdfStoragePath` server-side through Firebase Admin Storage, enforces PDF/file-size controls and returns private/no-store content.

**Verification:** own payslip downloads; another employee's payslip is rejected; unauthenticated download rejected; malformed/non-PDF object rejected; list response contains no persistent storage URL.

### EP-SEC-008 — Forgot PIN linked to obsolete/unprotected reset path
**Severity:** High  
**Status:** Remediated on `agent/security-employee-portal`; Deploy Preview/regression verification pending.  
**Scope:** `src/app/stafflogin/page.tsx`, `src/app/stafflogin/forgot-pin/page.tsx`, `src/app/api/staff/reset-pin/request/route.ts`, `src/app/api/staff/reset-pin/complete/route.ts`

Employee Portal now has a dedicated Forgot PIN flow. A portal account is resolved from the supplied cellphone, a short-lived random reset proof is issued and stored only as a hash server-side, Firebase phone OTP verifies ownership, and completion requires the verified Firebase ID token plus the matching unexpired reset proof. The new PIN is bcrypt-hashed. Existing Employee Portal sessions for that employee are deleted after a successful reset, forcing fresh login. The proof is consumed on success.

**Verification:** correct phone/OTP reset succeeds; unknown account receives generic failure; invalid/expired proof rejected; incorrect/expired OTP rejected; PIN must be six digits; proof replay rejected; old sessions invalidated; login works with new PIN.

### Production changes

NONE. All Cycle #2 changes remain isolated on `agent/security-employee-portal`. `employee-portal` and `main` are unchanged pending human review and Deploy Preview validation.
