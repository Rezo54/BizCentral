# Firestore Gate 1 — Named Database Emulator Runbook

**Purpose:** validate the `userAccess` Gate 1 candidate against the named Firestore database `biz-central` without production credentials, live data or production deployment.

**Working branch:** `agent/security-employee-portal`  
**Candidate rules:** `docs/security/firestore.rules.candidate-gate-1-userAccess`  
**Emulator config:** `docs/security/firebase.gate1-emulator.json`  
**Demo project:** `demo-bizcentral-rules`

## Safety boundary

This runbook is local-only. It must not use production Firebase credentials, production project IDs, exported production data or deployment commands.

Do not run `firebase deploy` from this workflow.

## Why the named database must be explicit

BizCentral initializes Firestore with `getFirestore(app, 'biz-central')`. Firebase's emulator documentation states that named databases referenced only implicitly can be created with open rules. The Gate 1 configuration therefore explicitly declares:

```json
"firestore": [
  {
    "database": "biz-central",
    "rules": "docs/security/firestore.rules.candidate-gate-1-userAccess"
  }
]
```

A successful test against `(default)` is not evidence for BizCentral Gate 1.

## Start command

From the repository root:

```powershell
npx firebase-tools emulators:start --only auth,firestore --project demo-bizcentral-rules --config docs/security/firebase.gate1-emulator.json
```

The expected Firestore emulator port is `8080`; Auth is `9099`.

## Target verification

Before recording any rule result, verify that the emulator startup output reports the configured named database/rules and that test requests address:

`projects/demo-bizcentral-rules/databases/biz-central`

If the request path contains `databases/(default)`, stop and record the run as invalid.

## Required Gate 1 matrix

Use synthetic UIDs and synthetic documents only.

### Allowed

1. An authenticated ordinary user can `get` its own `userAccess/{uid}` record.
2. An authenticated superadmin can `get` another `userAccess/{uid}` record.
3. An authenticated superadmin can list `userAccess` records.

### Denied

4. Unauthenticated caller cannot get `userAccess/{uid}`.
5. Ordinary authenticated user cannot get another user's `userAccess/{uid}`.
6. Ordinary authenticated user cannot list `userAccess`.
7. Ordinary authenticated user cannot create its own pending `userAccess` record through the client.
8. Ordinary authenticated user cannot update its own `userAccess` role, company, userType or status.
9. Superadmin client cannot create, update or delete `userAccess` through client Firestore.
10. The former bootstrap UID cannot create or update `userAccess` through client Firestore.
11. Client delete is denied for all callers.

## Server-path regression check

Gate 1 does not change Firebase Admin behavior. Separately verify the existing server-mediated application paths continue to own:

- signup pending-access creation;
- superadmin approve/reject/remove;
- user-access synchronization.

These checks are application/API regression checks, not client-rule allows.

## Evidence required to open human Gate 1 review

Record all of the following in `FIRESTORE_GATE_1_USERACCESS_VALIDATION.md`:

- date/time;
- branch SHA;
- Firebase CLI version;
- exact emulator command;
- explicit proof that `biz-central` was targeted;
- each matrix case PASS/FAIL;
- confirmation no production credentials/data were used;
- confirmation no Firebase deploy occurred.

Any `(default)`-database execution, open-rules warning for `biz-central`, unexpected allow, or inability to prove the database target is a **FAIL** and keeps Gate 1 closed.
