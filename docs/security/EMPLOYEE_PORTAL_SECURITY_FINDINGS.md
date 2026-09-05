# Employee Portal Security Findings

## EP-SEC-001 — Stale staff sessions are not revoked after portal-access changes

**Severity:** High  
**Status:** Remediated on agent branch — regression verification pending  
**Scope:** `src/lib/staff-session.ts`

### Finding

`validateStaffSession()` validated only the session document and its expiry. It did not re-check the linked `employeePortalAccess` record before authorising the request.

A session is valid for up to seven days. During that period, a session could remain usable even if the portal account was subsequently deactivated, deleted, or relinked to a different authentication identity.

### Remediation implemented

`validateStaffSession()` now re-reads `employeePortalAccess/{portalAccessId}` on every successful session lookup and rejects/deletes the session unless all of the following still match:

- `portalActivated === true`
- `employeeId`
- `edoId`
- `authUid`

Malformed session records are also deleted when rejected, and valid use refreshes `lastUsedAt`.

### Verification required

Regression coverage should confirm that:

1. Active matching access accepts the session.
2. Deactivated access rejects and deletes the session.
3. Missing access rejects and deletes the session.
4. Changed `employeeId`, `edoId`, or `authUid` rejects and deletes the session.
5. Expired sessions continue to reject and delete as before.

### Production changes

NONE.

---

## EP-SEC-002 — Activation ID verifier is not throttled before OTP counters

**Severity:** High  
**Status:** Open — remediation design/test required  
**Scope:** `src/app/api/staff/activation/check/route.ts`

### Finding

The activation endpoint verifies the supplied six-digit ID suffix before it enters the transaction that enforces OTP cooldown, window, daily and blocking counters. A wrong ID suffix returns `VERIFICATION_FAILED` before those counters are read or incremented.

An attacker who knows or guesses a valid employee cellphone can therefore make repeated guesses against the six-digit identity-verification step without being constrained by the existing OTP request limits.

### Security impact

The OTP controls protect successful identity verification / OTP initiation, but they do not currently rate-limit repeated failed guesses against the preceding identity verifier. This weakens brute-force resistance of the activation flow.

### Required remediation

Introduce a bounded failed-verification counter/block for the activation identity check without exposing whether the cellphone or ID suffix was correct. The implementation must preserve generic failure responses and should use an atomic transaction so concurrent requests cannot bypass the threshold.

### Verification required

Regression coverage should confirm that:

1. Invalid ID attempts increment the failed-verification counter.
2. Repeated failures trigger a temporary block.
3. A blocked identity cannot bypass the block with a correct ID suffix.
4. Successful verification clears or safely resets the failed-verification state.
5. Unknown cellphones retain the same generic external response and cannot be used for employee enumeration.
6. Existing OTP cooldown/window/daily limits continue to work independently.

### Production changes

NONE.
