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

Regression coverage should confirm that:

1. Active matching access accepts the session.
2. Deactivated access rejects and deletes the session.
3. Missing access rejects and deletes the session.
4. Changed `employeeId`, `edoId`, or `authUid` rejects and deletes the session.
5. Expired sessions continue to reject and delete as before.
6. Missing or non-employed employee records revoke the session and cookie.
7. An employee moved to another EDO cannot retain the old EDO-scoped session.

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

Regression coverage should confirm that:

1. Invalid ID attempts increment the failed-verification counter.
2. Five failures trigger a temporary block.
3. A blocked identity cannot bypass the block with a correct ID suffix.
4. Successful verification after expiry clears the failed-verification state.
5. Unknown cellphones retain the same generic external response and cannot be used for employee enumeration.
6. Existing OTP cooldown/window/daily limits continue to work independently.

### Production changes

NONE.
