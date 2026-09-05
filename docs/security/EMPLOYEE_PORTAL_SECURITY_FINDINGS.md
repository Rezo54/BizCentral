# Employee Portal Security Findings

## EP-SEC-001 — Stale staff sessions are not revoked after portal-access changes

**Severity:** High  
**Status:** Open — remediation write blocked pending human-assisted implementation/review  
**Scope:** `src/lib/staff-session.ts`

### Finding

`validateStaffSession()` currently validates only the session document and its expiry. It does not re-check the linked `employeePortalAccess` record before authorising the request.

A session is valid for up to seven days. During that period, a session can remain usable even if the portal account is subsequently deactivated, deleted, or relinked to a different authentication identity.

### Security impact

Revocation is not immediate. A previously issued session can outlive an administrative access change until the session expires or is explicitly deleted.

### Recommended remediation

On every successful session lookup, re-read `employeePortalAccess/{portalAccessId}` and reject/delete the session unless all of the following still match the session:

- `portalActivated === true`
- `employeeId`
- `edoId`
- `authUid`

Malformed session records should also be deleted when rejected.

### Verification required

Regression coverage should confirm that:

1. Active matching access accepts the session.
2. Deactivated access rejects and deletes the session.
3. Missing access rejects and deletes the session.
4. Changed `employeeId`, `edoId`, or `authUid` rejects and deletes the session.
5. Expired sessions continue to reject and delete as before.

### Production changes

NONE.
