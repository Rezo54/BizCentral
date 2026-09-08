# Employee Portal Security Findings

## EP-SEC-001 — Stale staff sessions are not revoked after portal-access changes

**Severity:** High  
**Status:** Remediated on agent branch — regression verification pending  
**Scope:** `src/lib/staff-session.ts`, `src/app/api/staff/session/route.ts`

### Finding

`validateStaffSession()` validated only the session document and its expiry. It did not re-check the linked `employeePortalAccess` record before authorising the request.

A session is valid for up to seven days. During that period, a session could remain usable even if the portal account was subsequently deactivated, deleted, relinked to a different authentication identity, or the linked employee stopped being an active employee.

### Remediation implemented

`validateStaffSession()` now re-reads `employeePortalAccess/{portalAccessId}` on every successful session lookup and rejects/deletes the session unless all of the following still match:

- `portalActivated === true`
- `employeeId`
- `edoId`
- `authUid`

Malformed session records are also deleted when rejected, and valid use refreshes `lastUsedAt`.

The staff-session endpoint additionally revokes the server session and clears the browser cookie if the employee record is missing, no longer has `status === 'employed'`, or its `edoId` no longer matches the authenticated session.

### Verification required

1. Active matching access accepts the session.
2. Deactivated or missing access rejects and deletes the session.
3. Changed `employeeId`, `edoId`, or `authUid` rejects and deletes the session.
4. Expired sessions continue to reject and delete as before.
5. Missing/non-employed employee records revoke the session and cookie.
6. An employee moved to another EDO cannot retain the old EDO-scoped session.

### Production changes

NONE.

---

## EP-SEC-002 — Activation ID verifier is not throttled before OTP counters

**Severity:** High  
**Status:** Remediated on agent branch — regression verification pending  
**Scope:** `src/app/api/staff/activation/check/route.ts`

### Finding

The activation endpoint previously verified the supplied six-digit ID suffix before entering the transaction that enforced OTP cooldown, window, daily and blocking counters. A wrong ID suffix returned `VERIFICATION_FAILED` before those counters were read or incremented.

### Remediation implemented

The activation identity verifier now participates in the same atomic account transaction as the OTP controls. It maintains a separate failed-verification window, blocks the employee activation identity after five failed ID-suffix attempts within 15 minutes for 30 minutes, prevents a correct suffix from bypassing an active block, and clears the failed-verification state after the block expires and a correct verification succeeds.

The existing generic verification response is retained for ordinary invalid-ID attempts. Unknown cellphones still return the same generic verification failure and do not reveal employee existence.

### Verification required

1. Invalid ID attempts increment the failed-verification counter.
2. Five failures trigger a temporary block.
3. A blocked identity cannot bypass the block with a correct ID suffix.
4. Successful verification after expiry clears the failed-verification state.
5. Unknown cellphones retain the same generic external response.
6. Existing OTP cooldown/window/daily limits continue independently.

### Production changes

NONE.

---

## EP-SEC-003 — Staff profile API returns the full employee ID number

**Severity:** Medium  
**Status:** Remediated on agent branch — UI/regression verification pending  
**Scope:** `src/app/api/staff/profile/route.ts`

### Finding

The authenticated staff profile endpoint returned the complete `employees.idNumber` value to the browser. Exposing the full national ID in an ordinary profile response unnecessarily increases sensitive-data exposure in browser memory, developer tools, logs and downstream client code.

### Remediation implemented

The endpoint now returns a masked ID value showing only the final four digits. The authoritative full ID remains server-side in Firestore for workflows that genuinely require it.

### Verification required

1. Profile UI remains usable with the masked value.
2. Full ID numbers are not returned by other Employee Portal endpoints unless strictly required.
3. Profile change workflows do not depend on the full ID being returned by the profile endpoint.

### Production changes

NONE.

---

## EP-SEC-004 — Unauthenticated Firebase Admin diagnostic endpoint

**Severity:** High  
**Status:** Remediated on agent branch — regression verification pending  
**Scope:** `src/app/api/staff/admin-test/route.ts`

### Finding

`/api/staff/admin-test` was callable without authentication. It performed a privileged Firebase Admin query and returned internal database/connectivity information. On failure it also returned the raw server exception message to the caller.

### Security impact

The route unnecessarily exposed a privileged diagnostic surface and internal operational/error information to unauthenticated clients.

### Remediation implemented

The historical route is now closed and always returns a generic `404 Not found` response with `Cache-Control: no-store`. It no longer initialises Firebase Admin, queries employee data, or returns internal exception details.

### Verification required

1. Unauthenticated requests receive only the generic 404 response.
2. No Employee Portal UI depends on this diagnostic endpoint.
3. Firebase Admin diagnostics, if needed in future, live behind Taskraft admin authorization rather than `/api/staff/*`.

### Production changes

NONE.


---

## EP-SEC-008 — PIN reset must revoke pre-reset staff sessions fail-closed

**Severity:** High  
**Status:** Remediated on agent branch — human validation pending  
**Scope:** `src/app/api/staff/reset-pin/*`, `src/lib/staff-session.ts`

### Finding

The Cycle 2 reset flow changes the PIN transactionally and then deletes existing `employeePortalSessions`. Session deletion is useful cleanup, but deletion alone is not a sufficient revocation boundary: if cleanup fails after the PIN transaction commits, an older session document could otherwise remain usable.

### Remediation implemented

PIN reset records `pinChangedAt` on the authoritative `employeePortalAccess` record. `validateStaffSession()` now rejects and deletes any session whose `createdAt` is missing or is at/before the latest `pinChangedAt`. This makes PIN-change revocation fail closed even if best-effort bulk session deletion fails.

The existing session deletion after successful reset remains in place as cleanup. Existing Cycle 1 portal-access, employment-status and EDO-binding revalidation remains unchanged.

### Verification required

1. Login normally and confirm the existing session works before reset.
2. Complete Forgot PIN with a valid SMS OTP and a new six-digit PIN.
3. Confirm every browser/session established before the reset receives an unauthorised/expired-session result on its next protected Staff Portal request.
4. Confirm login with the old PIN fails.
5. Confirm a fresh login with the new PIN succeeds and creates a session newer than `pinChangedAt`.
6. Confirm logout and normal seven-day session expiry behaviour remain unchanged.
7. Confirm suspended, terminated, moved-EDO and portal-disabled accounts continue to lose access as in Cycle 1.

### Production changes

NONE.


---

## EP-SEC-009 — Leave supporting-document upload trusted browser MIME type

**Severity:** Medium  
**Status:** Remediated on agent branch — human validation pending  
**Scope:** `src/app/api/staff/leave/document/route.ts`

### Finding

The authenticated Staff Portal leave-document endpoint enforced an allow-list of PDF/JPEG/PNG MIME types and an 8 MB limit, but accepted the browser-supplied `File.type` as proof of content type. A renamed or deliberately crafted file could therefore be stored under the employee leave-document path while claiming to be an allowed document type.

### Remediation implemented

The endpoint now reads the uploaded bytes before storage and verifies the expected PDF, JPEG or PNG file signature for the declared MIME type. Files whose content signature does not match the declared allowed type are rejected before Firebase Admin Storage is called.

Existing authenticated employee-session scoping, EDO/employee storage path, private/no-store metadata and size/type limits are preserved.

### Verification required

1. Upload a genuine PDF smaller than 8 MB — accepted.
2. Upload a genuine JPEG smaller than 8 MB — accepted.
3. Upload a genuine PNG smaller than 8 MB — accepted.
4. Rename a text/executable file to `.pdf` or submit it as `application/pdf` — rejected before storage.
5. Submit non-JPEG bytes as `image/jpeg` — rejected.
6. Submit non-PNG bytes as `image/png` — rejected.
7. Submit an allowed valid file larger than 8 MB — rejected.
8. Unauthenticated upload — rejected with 401.
9. Confirm successful leave submission still references only the authenticated employee's scoped document path.

### Production changes

NONE.


---

## EP-SEC-010 — Sensitive profile-change PIN confirmation lacked attempt throttling

**Severity:** Medium  
**Status:** Remediated on agent branch — human validation pending  
**Scope:** `src/app/api/staff/profile/change-request/route.ts`

### Finding

A valid staff session is required before an employee can request a cellphone or ID-number change, and the route correctly requires the current six-digit PIN. However, repeated incorrect PIN confirmations on this sensitive endpoint were not independently throttled. A stolen unattended authenticated session could therefore make repeated online PIN guesses without using the login endpoint's lockout.

### Remediation implemented

The profile-change confirmation now tracks failed PIN confirmations on the employee portal-access record. Five incorrect attempts trigger a 15-minute block for profile-change PIN confirmation. A successful PIN confirmation clears the profile-change failure counter/block.

The existing authenticated-session requirement, employee-derived identity, admin-approval workflow and no-direct-master-record-edit design are preserved.

### Verification required

1. Valid session + correct PIN + valid changed value — request succeeds.
2. Incorrect PIN attempts 1–4 — rejected and counted.
3. Fifth incorrect PIN — rejected and starts the 15-minute profile-change confirmation block.
4. Further attempts during the block — rejected with 429 even with the correct PIN.
5. After block expiry, correct PIN succeeds and clears the counter/block.
6. Login lockout and profile-change lockout remain separate controls.
7. Unauthenticated profile-change request remains rejected.
8. Employee cannot choose another employee ID or EDO in the request.

### Production changes

NONE.
