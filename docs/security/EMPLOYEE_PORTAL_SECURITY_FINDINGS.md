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
