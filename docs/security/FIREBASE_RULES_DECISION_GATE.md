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

**Status: READY TO PREPARE CANDIDATE RULE; NOT APPROVED FOR PRODUCTION DEPLOYMENT.**

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

## Subsequent gates

Expected sequence after Gate 1:

1. `invoices` — move remaining reliever approval browser read to the scoped API, then retire broad signed-in client access.
2. `users` — remove residual broad browser list/update dependencies.
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

**Production changes:** NONE.  
**Live Firestore rules:** UNCHANGED.  
**Live Storage rules:** UNCHANGED.
