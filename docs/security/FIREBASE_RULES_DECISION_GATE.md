# Firebase Rules Decision Gate

**Scope:** BizCentral Employee Portal security audit dependency map  
**Working branch:** `agent/security-employee-portal`  
**Baselines:** Firestore rules confirmed unchanged since 2 September 2026; Storage rules captured in `docs/security/storage.rules.current-baseline`.

## Current classification

| Area | Current dependency | Decision |
| --- | --- | --- |
| Employee Portal protected data | Staff APIs / Firebase Admin | Client Firestore authority is not required for protected Staff Portal data. |
| `userAccess` | Canonical authorization source; signup/admin lifecycle is server-mediated | Candidate to retire browser write authority after final residual-consumer verification. |
| `users` | Authorization role replaced by `userAccess`, but residual browser profile/list consumers remain | API migration required before broad list/update rules can be retired. |
| `invoices` | Submission/decisions mostly server-mediated; reliever approval page still lists invoices directly from Firestore | API migration required for remaining browser read before broad signed-in read can be retired. |
| `attendanceExceptions` | Employee Portal reads server-side; main BizCentral attendance workflow still reads/writes directly | API migration required; do not tighten live rule yet. |
| Suspension Storage | Browser directly uploads and obtains persistent download URLs | API migration required; do not tighten live Storage rule yet. |
| Legacy hard-coded admin UIDs | Still used by non-Employee-Portal BizCentral master-data workflows | Not globally obsolete yet. |

## Rules decision gate

Do not tighten production Firestore or Storage rules until each affected browser dependency has:
1. a server-authorized replacement API;
2. positive authorization tests;
3. negative/cross-scope authorization tests;
4. the UI switched away from direct Firebase access; and
5. explicit human approval for the production rule change.

## Current strongest retirement candidate

Browser writes to `userAccess` appear unnecessary for the verified signup, approve/reject/remove and synchronization workflows because those operations are server-mediated. Complete a residual-consumer sweep before preparing the candidate rule.

## Mandate stop conditions encountered

Suspension, attendance and broad BizCentral master-data migrations cross the Employee Portal-only remediation boundary. They are mapped here for human-directed follow-up but are not modified autonomously.

**Production changes:** NONE.
