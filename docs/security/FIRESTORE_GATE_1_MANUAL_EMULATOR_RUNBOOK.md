# Firestore Gate 1 — Named Database Emulator Runbook

**Purpose:** validate the `userAccess` Gate 1 candidate against the named Firestore database `biz-central` without production credentials, live data or production deployment.

**Working branch:** `agent/security-employee-portal`  
**Candidate rules:** `docs/security/firestore.rules.candidate-gate-1-userAccess`  
**Emulator config:** `docs/security/firebase.gate1-emulator.json`  
**Automated matrix:** `docs/security/run-gate1-named-db-test.cjs`  
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

## Automated local command

From the repository root, use Firebase Emulator Suite `exec` so the emulators are started, the matrix is run, and the local processes are stopped in one command:

```powershell
npx firebase-tools emulators:exec --only auth,firestore --project demo-bizcentral-rules --config docs/security/firebase.gate1-emulator.json "node docs/security/run-gate1-named-db-test.cjs"
```

The expected Firestore emulator port is `8080`; Auth is `9099`.

The harness:

- hard-codes the demo project `demo-bizcentral-rules` and named database `biz-central`;
- refuses to run if its Firestore REST target does not contain `/databases/biz-central/`;
- creates only synthetic Auth-emulator users;
- uses Firebase Admin only against the local Firestore emulator to seed synthetic rule fixtures;
- exercises client-rule assertions with Auth-emulator ID tokens against the named Firestore REST path;
- never calls a deploy API or production project.

## Target verification

Before recording any rule result, verify that the emulator startup output reports the configured named database/rules and that the harness prints a target beginning with:

`http://127.0.0.1:8080/v1/projects/demo-bizcentral-rules/databases/biz-central/documents`

If the request path contains `databases/(default)`, stop and record the run as invalid.

## Automated Gate 1 matrix

The current harness verifies:

### Allowed

1. An authenticated ordinary user can `get` its own `userAccess/{uid}` record.
2. An authenticated superadmin can list `userAccess` records.

### Denied

3. Ordinary authenticated user cannot get another user's `userAccess/{uid}`.
4. Ordinary authenticated user cannot list `userAccess`.
5. Ordinary authenticated user cannot create its own `userAccess` record through the client.
6. Ordinary authenticated user cannot elevate its own `accessLevel` through the client.
7. Ordinary authenticated user cannot mutate another user's `userAccess` record.
8. Ordinary authenticated user cannot delete its own `userAccess` record.
9. Superadmin client cannot update another `userAccess` record under the Gate 1 candidate.

## Remaining manual assertions before human Gate 1 review

The following cases remain explicit manual checks until they are added to the harness:

1. Unauthenticated caller cannot get `userAccess/{uid}`.
2. Superadmin can `get` another `userAccess/{uid}` record.
3. Superadmin client cannot create or delete `userAccess`.
4. The former bootstrap UID cannot create or update `userAccess` through client Firestore.
5. Client delete is denied for every caller class.

No human Gate 1 review should be opened until the complete matrix is covered and passes.

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
