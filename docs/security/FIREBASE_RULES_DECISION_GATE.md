# Firebase Rules Decision Gate

**Scope:** BizCentral Employee Portal security audit dependency map  
**Working branch:** `agent/security-employee-portal`  
**Baselines:** Firestore rules confirmed unchanged since 2 September 2026; Storage rules captured in `docs/security/storage.rules.current-baseline`.

## Current classification

| Area | Current dependency | Decision |
| --- | --- | --- |
| Employee Portal protected data | Staff APIs / Firebase Admin | Client Firestore authority is not required for protected Staff Portal data. |
| `userAccess` | Canonical authorization source. Signup, approve/reject/remove and synchronization mutations are server-mediated. Residual-consumer sweep found legitimate browser reads but no required browser writes. | **READY FOR CANDIDATE RULE:** retire browser create/update/delete; retain required read semantics for now. |
| `users` | Authorization role replaced by `userAccess`, but residual browser profile/list consumers remain. | API migration required before broad list/update rules can be retired. |
| `invoices` | Submission and decisions are largely server-mediated; reliever approval page still lists invoices directly from Firestore. | API migration required for remaining browser read before broad signed-in read can be retired. |
| `attendanceExceptions` | Employee Portal reads server-side; main BizCentral attendance workflow still reads/writes directly. | API migration required; do not tighten live rule yet. |
| Suspension Storage | Browser directly uploads and obtains persistent download URLs. | API migration required; do not tighten live Storage rule yet. |
| Legacy hard-coded admin UIDs | Still used by non-Employee-Portal BizCentral master-data workflows. | Not globally obsolete yet. |

## Rules migration method

Rules are migrated in small, reversible gates rather than as one broad rewrite.

For each collection/path:

1. **Map the dependency** — identify every legitimate browser read/write that relies on the current rule.
2. **Provide a server-authorized replacement** — privileged mutations and sensitive reads move behind authenticated APIs where appropriate.
3. **Switch the UI** — remove the direct Firebase operation before its permission is retired.
4. **Run positive tests** — verify every legitimate workflow still succeeds.
5. **Run negative/cross-scope tests** — verify unauthorized, cross-user and cross-company access is rejected.
6. **Prepare a candidate rule in Git** — preserve the current baseline separately; do not alter production yet.
7. **Human review and explicit approval** — review the exact rule delta and test evidence.
8. **Apply only that approved rule gate to Firebase** — no unrelated rule changes in the same production change.
9. **Immediate smoke test** — repeat the affected legitimate and negative workflows.
10. **Rollback if required** — restore the saved baseline block if a legitimate dependency was missed.
11. **Record completion** — update the migration matrix, findings and decision-gate documentation before moving to the next collection.

## Gate 1 — `userAccess` client writes

**Status: CANDIDATE RULE PREPARED; STATICALLY VERIFIED; RUNTIME EMULATOR VALIDATION PENDING; NOT APPROVED FOR PRODUCTION DEPLOYMENT.**

Verified lifecycle mutations:

- signup creates the pending authorization record server-side;
- approve/reject/remove operations are server-mediated;
- user-access synchronization is server-mediated;
- residual-consumer review found legitimate browser reads of `userAccess`, but no required browser create/update/delete workflow.

### Gate 1 intended rule effect

- retain the currently required browser read semantics;
- deny browser `create`, `update` and `delete` on `userAccess`;
- Firebase Admin/server APIs remain unaffected by Firestore client rules;
- remove the legacy browser bootstrap-superadmin mutation exception from this path.

### Gate 1 validation before live rule change

- signup succeeds and creates pending access;
- superadmin approve succeeds;
- superadmin reject/remove succeeds;
- user-access synchronization succeeds;
- normal authorized BizCentral session resolution succeeds;
- legitimate browser reads required by current UI succeed;
- direct browser create/update/delete of `userAccess` fails;
- ordinary user cannot elevate role/company/userType;
- cross-user/cross-company mutation fails.

Only after these tests pass against the candidate configuration and Benedict explicitly approves the production change may Gate 1 be applied to Firebase.

## Gate 1 test-environment preparation

A test-only Firebase Emulator configuration now exists at `docs/security/firebase.gate1-emulator.json`.

- It targets the demo project ID `demo-bizcentral-rules`, not the production Firebase project.
- It loads the Gate 1 candidate rules for the named `biz-central` Firestore database.
- It starts only local Auth and Firestore emulators.
- It does not contain production credentials or deployment configuration.
- Root `firebase.json` / `.firebaserc` were deliberately not modified.

The preferred automated runner is a local `@firebase/rules-unit-testing` suite because Firebase documents that this library can create authenticated rule-test contexts and bypass rules only for fixture setup.

**Named-database validation constraint:** BizCentral uses the named Firestore database `biz-central`. Current Firebase documentation states that `RulesTestEnvironment.clearFirestore()` operates on the default Firestore database and `RulesTestContext.firestore()` does not expose a database-ID parameter. Firebase also warns that named databases implicitly created by SDK/REST access can operate with open rules unless they are explicitly configured. Therefore a test that silently exercises `(default)` is not acceptable evidence for this gate. Runtime Gate 1 evidence must explicitly demonstrate that operations are targeting `projects/demo-bizcentral-rules/databases/biz-central` and that the candidate rules are loaded for that named database.

**Gate 1 human test gate is therefore NOT YET OPEN.** Static evidence is complete; the remaining requirement is an executable local rules test or equivalent emulator integration test that proves both the deny/allow matrix and the named-database target before any live-rule change.

## Residual dependency map — verified 9–10 September 2026

### `invoices`

Direct browser reads remain in at least two legitimate BizCentral surfaces:

- the main dashboard reads pending invoices directly from Firestore;
- the reliever invoice approval page reads the full `invoices` collection directly, then filters in the browser.

Invoice decision mutations already use the protected server API, but **broad client read cannot yet be retired**. Migrating these non-Employee-Portal pages is outside the current autonomous mandate.

The 2 September baseline also has an independent integrity weakness: the second `allow update` branch only restricts the changed field names (`status`, approval/rejection audit fields) and does **not** restrict the actor by role, ownership or company. Because `allow read` is also `signedIn()`, this residual client rule allows any signed-in Firebase user who can identify an invoice to attempt an approval/rejection transition. The application has already moved legitimate invoice decisions server-side, so this permission is a **retirement candidate**, but it cannot be changed independently in this mandate because invoice pages still depend on direct client reads and the live rule change affects non-Employee-Portal functionality.

**Decision:** API migration required for remaining client reads; approval-status client mutation authority should be retired at the invoice rule gate, not preserved as legitimate functionality.

### `users`

Residual browser dependencies remain:

- `src/data/users.ts` still has `setDoc()` self-profile creation, `getDoc()` profile retrieval, full-collection `getDocs()` for pending users and direct `updateDoc()` approval;
- `src/data/edo-routes.ts` lists the entire `users` collection to derive EDO company options, in addition to reading `routes`.

The baseline permits any signed-in user to list all `users` and update any `users` document. The legitimate helper dependencies above explain why a broad immediate rules denial risks regression; they do **not** justify retaining the broad actor model as the target state.

**Decision:** `users` broad list/update permissions require API/data-source migration. Self-profile `get` may remain as a narrowly scoped client permission if still needed after migration. Direct approval updates should move server-side and broad signed-in update should be retired.

### `attendanceExceptions`

The main attendance page still directly reads and writes `attendanceExceptions` and also directly manipulates `attendanceRecords`. This is a legitimate operational dependency outside the Employee Portal-only remediation boundary.

The baseline `attendanceExceptions` read rule is nevertheless overbroad (`signedIn()`), while mutations rely on three hard-coded UIDs. The target is scoped server authorization, but changing it now would alter the main attendance workflow.

**Decision:** no Firestore tightening for attendance collections in this cycle. Read/write migration is required before the hard-coded UID mutation exception can be retired.

### Suspension Firestore + Storage

The suspension page currently:

- authorizes the UI by directly reading its own `userAccess` document;
- reads employee and suspension records directly from Firestore;
- creates suspension records directly from the browser;
- uploads supporting PDFs/JPG/PNG directly to Storage under `suspensions/{employeeId}/{suspensionId}/...`;
- calls `getDownloadURL()` and stores the resulting persistent URL on the suspension record;
- cancels suspensions with direct browser `updateDoc()`.

The authoritative Storage baseline permits **any signed-in Firebase user** to read suspension documents and attempt a size/type-valid create. Storage rules do not consult `userAccess`, do not verify Taskraft/admin role, do not bind `employeeId` or `suspensionId` to an authorized Firestore suspension record and do not validate upload metadata. The application UI is therefore narrower than the Storage authority, meaning UI visibility is currently carrying security responsibility that must not be treated as an authorization boundary.

**Decision:** suspension Storage is a high-priority API-migration gate, but it is **not safe to tighten yet** because the current legitimate suspension workflow depends on direct browser upload/read. The future migration must move create/upload/download/cancel behind server authorization, stop persisting browser-facing download URLs, and then deny direct browser Storage access. The existing `update, delete: false` immutability control should be preserved.

### Legacy hard-coded UIDs

The 2 September Firestore baseline still uses hard-coded privileged UIDs for `/users` delete, signup-company maintenance, companies, relievers, EDOs, routes, employees and attendance exceptions. The Gate 1 `userAccess` bootstrap UID exception is different: lifecycle mutations have already moved server-side and no legitimate browser write dependency remains, so that specific exception can be retired with Gate 1.

**Decision:**

- **Retire at Gate 1:** hard-coded bootstrap authority for browser mutation of `userAccess`.
- **Retire after API migration:** UID allowlists for employee master data and `attendanceExceptions`.
- **Still supports legitimate BizCentral functionality today:** UID allowlists for non-Employee-Portal master-data workflows (`companies`, `relievers`, `edos`, `routes`, signup-company maintenance) until their server-authorized replacements are implemented and tested.
- **Do not remove globally now:** doing so would create legitimate regressions outside this mandate.

## Permission retirement summary — 10 September 2026

| Permission | Current decision | Reason |
| --- | --- | --- |
| `userAccess` browser create/update/delete | **Safe to retire after named-db emulator proof + human approval** | Lifecycle mutations are server-mediated; no required browser writes found. |
| `userAccess` own get / superadmin list | **Retain for now** | Legitimate browser consumers remain. |
| `users` broad signed-in update | **Must retire, API migration first** | Direct helpers still depend on it; current actor scope is unsafe. |
| `users` broad signed-in list | **Must retire, data/API migration first** | Pending-user and EDO-option consumers still list the collection. |
| `invoices` approval-status client mutation | **Must retire at invoice gate** | Legitimate decisions are server-mediated; current rule has no actor restriction. |
| `invoices` broad signed-in read | **Retain temporarily, API migration required** | Dashboard/reliever pages still read directly. |
| `attendanceExceptions` broad read + UID writes | **Retain temporarily, API migration required** | Main attendance workflow depends on direct browser access. |
| Suspension Storage signed-in read/create | **Retain temporarily only because workflow still depends on it; high-priority migration** | Current Storage authorization is materially broader than the UI. |
| Legacy master-data UID allowlists | **Retain temporarily** | Still back legitimate non-Employee-Portal browser workflows. |

## Subsequent gates

Expected sequence after Gate 1:

1. `invoices` — move remaining dashboard/reliever browser reads to scoped API, then retire broad signed-in client read and actor-unrestricted status mutation.
2. `users` — remove residual broad browser list/update dependencies; retain only narrowly justified profile reads if needed.
3. `attendanceExceptions` — migrate main attendance browser reads/writes to scoped APIs.
4. Suspension Storage — migrate upload/read/download to server-authorized APIs, then deny browser Storage access.
5. Legacy hard-coded admin UIDs — retire only after all dependent BizCentral master-data workflows have server/role-based replacements.

The sequence can change if dependency mapping shows a safer order.

## Rules decision gate

Do not tighten production Firestore or Storage rules until each affected browser dependency has:

1. a server-authorized replacement where required;
2. positive authorization tests;
3. negative/cross-scope authorization tests;
4. the UI switched away from direct Firebase access where that permission is being retired; and
5. explicit human approval for the production rule change.

## Mandate stop conditions encountered

Suspension, attendance and broad BizCentral master-data migrations cross the Employee Portal-only remediation boundary. They are mapped here for human-directed follow-up but are not modified autonomously.

The Gate 1 runtime test is also constrained by the named `biz-central` database requirement. A default-database-only rules test would not meet the evidence threshold and must not be used to open the production decision gate.

**Production changes:** NONE.  
**Live Firestore rules:** UNCHANGED.  
**Live Storage rules:** UNCHANGED.
