# BizCentral Firestore Rules Migration Matrix v1.0

Baseline rules captured: 02 September 2026 13:01 by Benedict Mahlangu
Analysis prepared: 02 September 2026 by Sol (OpenAI GPT-5.6 Sol)
Project owner / production approval: Benedict Mahlangu
Source baseline: `docs/security/firestore.rules.current-baseline`
Companion audit: `docs/security/BIZCENTRAL_SECURITY_MIGRATION_AUDIT_V1.md`

## Change-control principle

The baseline rules are frozen as the record of the currently running BizCentral security policy. They are NOT to be edited in place. Application/API migrations are built and tested in Employee Mod while these deployed rules remain unchanged. A rule is tightened only after its corresponding client dependency has been removed and the replacement API has passed positive and negative authorization tests.

## Baseline observations

The rules already declare `userAccess/{uid}` as canonical authorization and `/users` as profile data. This is the correct target direction. The largest remaining weaknesses are not absence of `userAccess`; they are legacy broad permissions and direct browser operations that still require those permissions.

The baseline also contains explicit UID allowlists for several master-data operations. These are legacy administrative exceptions and should be removed only after replacement APIs are tested.

## Collection migration matrix

| Collection | Baseline read | Baseline write | Current application dependency | Risk / observation | Target state | Migration stage |
|---|---|---|---|---|---|---|
| `users` | own get; **any signed-in user may list all** | self-create; **any signed-in user may update any user**; delete one hard-coded UID | signup, getCurrentUser, admin users | CRITICAL: broad list/update; users is still consumed as authority by legacy session | profile data only; server-admin mutations; self-profile fields narrowly controlled if needed | 1-4 |
| `userAccess` | own get; superadmin list | self pending-create; superadmin/bootstrap update; no delete | canonical rules auth, admin approval, sync page | Good canonical model, but sync/approval still browser writes | server-managed authorization; possibly retain tightly constrained pending bootstrap only if needed | 1-4 |
| `signupCompanies` | public | Taskraft or bootstrap UID | signup directory sync | public read intentional; write should be server/admin | public read, server-only write | 9 |
| `companies` | any signed-in | 3 hard-coded UIDs | admin company/EDO import | legacy UID allowlist; broad read | server-admin writes; reads scoped/minimized by use case | 9 |
| `relievers` | any signed-in | 3 hard-coded UIDs | reliever upload/listing | legacy UID allowlist; broad read | server-admin writes; scoped reads/API | 9 |
| `edos` | any signed-in | 3 hard-coded UIDs | legacy/admin data | legacy UID allowlist | server-admin writes; scoped reads if collection remains required | 9 |
| `routes` | any signed-in | 3 hard-coded UIDs | route master/admin upload | legacy UID allowlist; route data may later support schedules | server-admin writes; role/scope-aware reads/API | 9/driver schedule |
| `employees` | Taskraft all; EDO own company | create/delete 3 UIDs; update 3 UIDs or accountant limited Sage fields | People, add/edit/upload, attendance, leave | Reads reasonably scoped; master writes legacy; accountant client update is intentionally narrow but still client | API for master writes/import; server accountant import; retain scoped reads temporarily then API if useful | 5/11 |
| `attendanceExceptions` | **any signed-in** | 3 hard-coded UIDs | attendance page | broad read exposes cross-company attendance exception data; EDO direct mutation model does not align cleanly with allowlist | scoped API reads/writes; server validates employee/company/date/type | 6 |
| `suspensions` | Taskraft only | Taskraft admin/superadmin; no delete | suspension register/attendance | comparatively strong rule; direct privileged client write still exists/possible | API write; Taskraft scoped server read where needed; immutable audit history | after employee/attendance core |
| `attendanceRecords` | Taskraft all; EDO own | Taskraft or EDO own | attendance weekend records | good company scoping but direct client writes permit business-state mutation | API mutation; optional scoped client read until migrated | 6 |
| `leaveRequests` | Taskraft all; EDO own | Taskraft/EDO pending create; tightly limited status updates; no delete | Leave page + existing APIs/staff | better rules but client can still create/approve within allowed fields; server APIs already exist for parts | API create/review/list; Firestore client writes eventually false | 7 |
| `payslips` | accountant or superadmin | accountant/superadmin constrained; no delete | payroll import; server EDO/staff retrieval | relatively strong client rules; payroll is sensitive enough to prefer server-only import | server accountant/superadmin import; client reads/writes denied; EDO/staff via API | 11 |
| `invoices` | **any signed-in** | reliever create; reliever pending limited update/delete; **any signed-in user can change approval status fields** | reliever invoicing | CRITICAL: approval branch has no role/ownership check; broad read; server must own rate/amount/status transitions | API-only writes; scoped reads; server-calculated rates/amounts and actor | 8 |
| `adminMessages` | Taskraft all; EDO addressed messages | client create/update/delete false | admin messages API | strong target pattern | retain; possibly migrate reads to API later if needed | consolidate |
| `pushDevices` | false | false | notification API | strong server-only pattern | retain | consolidate |
| `crateReplacementRates` | any approved user | superadmin create; immutable | crate settings | reasonable rule but direct browser privileged write; all approved users can read rate | API superadmin create; server stamps actor; client write false | 10 |
| `crateReconDaily` | Taskraft all; EDO own | any Taskraft create/update; no delete | crate UI + upload | read scope good; any Taskraft can import/overwrite recon through client | import API restricted to intended Taskraft role; client write false | 10 |
| `crateSlips` | Taskraft all; EDO own | false | future driver slip API | already designed correctly for server submission | retain server-only mutation | future schedule |
| `routeSchedules` | Taskraft all; EDO own | Taskraft create/update; no delete | future schedule | current rules allow any approved Taskraft to mutate; future workflow should define exact scheduler role | API mutation; client write false; staff reads only through API | future schedule |
| `crateDisputes` | Taskraft all; EDO own | false | future dispute workflow | safe placeholder | API create/update with workflow transitions and audit | future dispute |

## Critical baseline issues requiring early attention

### A. `users` update is too broad
The baseline permits `allow update: if signedIn();`. Therefore any signed-in Firebase user may attempt to update any `users` document if they know/obtain its document ID. UI restrictions do not mitigate this. We will not change the live rule immediately because current admin/signup/profile workflows may depend on it. Instead Step 3/4 will remove those dependencies first, then this rule will be narrowed.

### B. `users` list is too broad
`allow list: if signedIn();` permits all signed-in users to query the profile directory. This can expose names/emails/business metadata unnecessarily. Legacy `getCurrentUser()` currently queries users by UID, so this cannot be tightened until the session source moves to `userAccess`.

### C. `invoices` approval update is critically broad
The second update branch restricts changed field names but does not restrict the actor. Any signed-in user who can identify an invoice may change status/approval/rejection fields. Because invoice reads are also open to any signed-in user, this is the highest business-integrity rule issue found in the baseline. We will migrate invoice transitions to server API before tightening the live rule.

### D. Hard-coded UID administrator allowlists
`companies`, `relievers`, `edos`, `routes`, employee master operations and `attendanceExceptions` use three explicit Firebase UIDs. These rules encode people rather than roles/capabilities. They are retained temporarily for compatibility, then replaced by API authorization from `userAccess`.

### E. `attendanceExceptions` read is global to signed-in users
Any signed-in user may read the collection. This should eventually become Taskraft/own-EDO scoped or API-only. Because attendance screens currently use direct Firestore access, migration comes before rule tightening.

## Sequential rule-change gates

No rule moves to the next state until all gates pass.

### Gate 1 — Replacement exists
- API endpoint implemented with Admin SDK.
- Server loads `userAccess` from verified Firebase token.
- Server derives actor and company scope; does not trust request body authority.

### Gate 2 — Employee Mod positive tests
- intended Taskraft role succeeds;
- intended EDO succeeds only where applicable;
- staff session succeeds only where applicable.

### Gate 3 — Employee Mod negative tests
- unauthenticated denied;
- missing/pending/rejected/removed userAccess denied;
- wrong role denied;
- EDO A cannot access/mutate EDO B;
- manipulated `companyId`/`edoId`/actor/status/rate is denied or ignored;
- invalid state transition denied.

### Gate 4 — UI switched
- relevant page no longer imports direct Firestore mutation for that action;
- normal workflow works through API;
- errors are user-readable;
- audit fields are server-derived.

### Gate 5 — Rule candidate prepared
- candidate rule stored separately from current baseline;
- diff reviewed by Sol;
- production impact reviewed/approved by Benedict Mahlangu;
- only the intended collection block changes.

### Gate 6 — Rule test and deployment
- candidate tested against Employee Mod/test workflow;
- old direct client mutation is confirmed denied under candidate;
- API remains successful because Admin SDK bypasses client rules;
- production rule changed only after explicit approval;
- smoke test immediately after deployment.

## Proposed first implementation sequence

1. Build common server authorization helper without changing rules or UI.
2. Build canonical `/api/session` backed by `userAccess` and migrate session consumers incrementally.
3. Move user approval/rejection/removal/userAccess repair behind superadmin API.
4. Change signup so requested role/type never becomes effective authority until server approval.
5. Prepare first candidate rules for `users` and `userAccess`, but do not deploy until Steps 1-4 tests pass.
6. Employee master APIs and tests, then employee rule candidate.
7. Attendance APIs and tests, then attendance rule candidates.
8. Leave completion, then leave rule candidate.
9. Invoice API migration urgently before reliever-view expansion, then invoice rule candidate.
10. Master-data import APIs, then companies/routes/relievers/edos rule candidates.
11. Crate privileged APIs, then crate rule candidates.
12. Payslip import hardening.
13. Consolidate existing good APIs onto common helper.
14. Remove legacy authority code only when no consumers remain.

## Documentation discipline

For every security implementation commit, record:
- date/time;
- branch;
- files changed;
- collection/action affected;
- old path;
- new path;
- authorization requirement;
- tests performed and result;
- whether live rules changed (normally NO during application migration);
- reviewed by Sol;
- production approval by Benedict Mahlangu when applicable;
- commit SHA.

A separate `BIZCENTRAL_SECURITY_CHANGE_LOG.md` should be started with the first code implementation in Step 1 and updated after each security commit. Before starting each subsequent step, re-read the Audit, Matrix and Change Log and compare them with the current branch.