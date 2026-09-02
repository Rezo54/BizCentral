# BizCentral Security Migration Audit v1.0

Date: 2026-09-02
Branch audited: employee-portal
Purpose: create a precise migration path from legacy browser/Firestore authorization to server-side API authorization without disrupting the currently running BizCentral/BizPortal.

## 1. Migration principle

The existing production Firestore rules remain in place while application code is migrated. New API endpoints and authorization helpers are added and tested in Employee Mod first. Existing client paths are removed only after the replacement path has passed role/scope tests. Firestore rules are tightened only after the application migration for the relevant collection is proven.

The migration sequence for every module is:
1. Record current behaviour and current Firestore dependency.
2. Add server/API authorization using Firebase ID token or staff session.
3. Resolve authorization from userAccess (or employeePortalSessions for staff).
4. Implement server-side ownership/scope checks.
5. Switch the Employee Mod UI to the API.
6. Test allowed and denied scenarios.
7. Keep old Firestore rules during this test period.
8. After sign-off, tighten only the rules for the migrated collection.
9. Retest production-equivalent flows before deployment.

No big-bang rules replacement.

## 2. Target security boundary

Firebase Auth / staff session -> server API -> canonical authorization -> Admin SDK -> Firestore/Storage.

UI role checks remain useful for navigation and button visibility, but are not treated as the security boundary.

Canonical BizCentral authorization: userAccess/{uid}.
Canonical staff authorization: employeePortalSessions plus server-side employee/EDO/schedule checks.

## 3. Existing strong foundations to preserve

- src/lib/firebase-admin.ts: server-only Admin SDK initialization for biz-central database.
- src/lib/staff-session.ts: random staff session tokens, SHA-256 token storage, expiry validation.
- src/lib/employee-security.ts: server HMAC utilities and constant-time hash comparison.
- /api/staff/*: employee portal is already predominantly API/server based.
- /api/edo/payslips: verifies Firebase token, approved userAccess, EDO type and company scope server-side.
- /api/month-end: verifies Firebase token, userAccess and server-side Taskraft/EDO scope; EDO reads approved own-company records only.
- /api/admin/messages: verifies token and Taskraft admin/superadmin before privileged write.
- /api/admin/leave-document and /api/admin/leave-review: use userAccess and EDO ownership checks before returning scoped data.
- /api/admin/profile-change: uses server transactions and EDO ownership checks.

These are patterns to standardize rather than replace.

## 4. Cross-cutting legacy findings

### 4.1 Legacy session source — HIGH PRIORITY
src/lib/session.ts still queries the browser-readable users collection by Firebase UID and returns userType/accessLevel/companyId from users. Many pages use getCurrentUser(), so users remains an implicit authorization source.

Target: replace with a canonical current-user endpoint/helper sourced from userAccess. Keep users as profile/workflow data, not authority.

### 4.2 Legacy access helper — HIGH PRIORITY
src/lib/acess.ts derives canApprove/isAdmin from client-side accessLevel values. It may remain for presentation only, but server APIs must independently authorize every privileged action.

### 4.3 Signup assigns authority in the client — HIGH PRIORITY
src/app/signup/page.tsx assigns default access levels including Taskraft -> admin and EDO -> power_user before writing users.

Target: signup may request a user type/business association, but must not grant effective privileged authorization. Effective userAccess is created/approved by a privileged server operation.

### 4.4 userAccess sync is browser write — HIGH PRIORITY
src/app/(app)/admin/sync-user-access/page.tsx reads all users and directly setDoc()s userAccess from the browser.

Target: server-only superadmin migration/repair endpoint. Eventually this page becomes an API client or is retired after userAccess is maintained automatically.

## 5. Module inventory

Risk labels:
- GOOD: server-side authorization and scope already enforce the operation.
- TRANSITIONAL: userAccess/scoped Firestore query exists, but browser still performs sensitive reads/writes.
- LEGACY: browser performs privileged Firestore operation and relies on Firestore rules/client role logic.
- HIGH RISK: authorization/profile or sensitive business state can be changed through a legacy client path.

### 5.1 User administration
Files: admin/users, admin/sync-user-access, signup, src/data/users.ts.
Current: browser reads users; approval/rejection/removal writes users and userAccess directly using writeBatch/deleteDoc. UI determines superadmin from getCurrentUser(), which currently comes from users.
Classification: HIGH RISK / LEGACY.
Target APIs: GET /api/admin/users; POST/PATCH /api/admin/users/{id}/decision; DELETE or disable endpoint; POST /api/admin/user-access/sync/repair.
Authorization: approved userAccess + Taskraft + superadmin for access decisions. Protect last superadmin/self-removal scenarios server-side. Keep audit fields.

### 5.2 Companies, EDO and Reliever master uploads
Files: admin/companies, admin/upload-edo, admin/upload-reliever, admin/sync-signup-companies.
Current: direct browser setDoc/getDocs against companies, routes, relievers and related master data.
Classification: LEGACY; privileged master-data write.
Target: admin import APIs with server validation, duplicate/id validation, batch writes and audit metadata. Separate preview/parse in browser from authoritative commit on server.

### 5.3 People / employee master
Files: people/page, employee/new, employee/[employeeId]/edit, people/upload, suspensions/profile pages.
Current: People page correctly scopes EDO employee reads using userAccess and Firestore query. However employee add/edit/bulk upload write employees directly from browser. Edit page itself does not independently establish Taskraft authorization before updateDoc; it relies heavily on route visibility + Firestore rules. Bulk upload also commits directly.
Classification: reads TRANSITIONAL; employee master writes HIGH RISK/LEGACY.
Target APIs: scoped employee list/read API; Taskraft employee create/update/import APIs; EDO profile-change workflow remains separate for changes EDO is allowed to request. Server validates immutable company/employee-code relationships and audit fields.

### 5.4 Attendance
File: people/attendance/page.tsx.
Current: userAccess is read in browser and EDO queries are scoped. Attendance exceptions and Saturday/Sunday attendance records are created/deleted directly from browser. Export reads collections directly.
Classification: TRANSITIONAL but important write migration.
Target: /api/people/attendance for daily scoped reads; POST/PATCH for attendance exception and weekend work; export may be server-generated or use scoped API data. Server verifies EDO ownership, no future dates, employee belongs to company, allowed record types.

### 5.5 Leave
Files: people/leave and leave review pages; /api/admin/leave-review; /api/admin/leave-document; /api/staff/leave.
Current: Leave register scopes EDO Firestore queries using userAccess, but creation still addDoc()s leaveRequests directly from browser. Review/document APIs are newer and server scoped. Staff leave is API based.
Classification: mixed; read/review GOOD/TRANSITIONAL, creation LEGACY.
Target: move BizCentral leave creation/listing to API while preserving current review/document endpoints. Server derives requester identity and verifies selected employee/EDO. Do not trust edoId, employee name or requestedBy supplied by client.

### 5.6 Payslips
Files: /payslips, /people/payslips, /api/edo/payslips, /api/staff/payslips and upload/import code.
Current: EDO payslip retrieval is server-scoped and good. Staff retrieval is staff-session API based. Admin/accountant import needs to remain privileged and should be checked/migrated to server-only commit where any browser Firestore write remains.
Classification: retrieval GOOD; import requires continued audit/migration.
Target: all PDF/storage access through short-lived server authorization; imports via Taskraft account-role/admin API with employee matching performed server-side.

### 5.7 Invoicing / reliever invoices
Files: src/data/invoicing.ts; invoicing/reliever; approve; summary; rates.
Current: createRelieverInvoice uses browser addDoc. Approval/rejection uses browser updateDoc. Reliever page can delete invoice directly. Some pages read entire invoices collection then filter. Rate matrix is in-memory client module; Rates page checks legacy role strings and changing rates is not durable authoritative configuration.
Classification: HIGH RISK / LEGACY.
Target: invoice API with action-specific authorization: reliever creates own invoice, EDO/authorized Taskraft reviews only allowed invoice, deletion/cancellation constrained by status/ownership, server stamps identities/timestamps/rates. Persist effective rate configuration in Firestore through admin API; client never supplies authoritative rate/amount.

### 5.8 Month-end / business performance / truck lease
Files: /api/month-end, month-end pages, business-performance, accounting/truck-lease.
Current: /api/month-end is a good server-authorized pattern. Taskraft admin import/approval is checked server-side; EDO GET is company-scoped and approved-only. Truck lease consumes this API.
Classification: GOOD, with authorization helper duplication to refactor later.
Target: retain behaviour; migrate repeated context()/isAdmin() code to common server authorization helper after helper is proven.

### 5.9 Crate & Dolly
Files: accounting/crate-control, settings, upload.
Current: main EDO recon query was corrected to query by edoId and Firestore rules enforce scope. However upload commits crateReconDaily directly with browser writeBatch and allows any Taskraft user in UI; replacement cost settings addDoc directly and UI checks superadmin from legacy getCurrentUser/users. Reads remain client Firestore.
Classification: TRANSITIONAL; upload/settings are privileged LEGACY writes.
Target APIs: crate recon import commit API (preview can remain client); replacement-rate API requiring approved Taskraft superadmin; crate read API for EDO/Taskraft and later route-scheduled staff. After API migration, crateReconDaily and crateReplacementRates client writes can be denied.

### 5.10 Messages / notifications
Files: /api/admin/messages, /api/messages, /api/notifications/register, UI message pages.
Current: privileged message creation already server-side with Taskraft admin authorization. Continue auditing read/device ownership endpoints, but this is structurally on the target path.
Classification: GOOD / verify scope edge cases.

### 5.11 Staff portal
Files: src/app/api/staff/*, stafflogin, staffportal, staff-session.ts.
Current: dedicated server sessions, Admin SDK, session expiry, scoped employee operations. This architecture intentionally bypasses direct staff Firestore browser access.
Classification: GOOD target architecture.
Target: use this pattern for future driver/reliever schedule access. Remove/disable development-only admin-test endpoint before broad production hardening if it is not required.

### 5.12 Crate future driver/reliever access
Not implemented yet.
Target: routeSchedules controls operational-day route scope. Staff session + employee + scheduled route is checked server-side before crate data/slip submission. Never grant all employing EDO routes to a driver merely because of employment relationship.

## 6. Important authorization inconsistencies found

1. getCurrentUser() uses users while newer APIs use userAccess. Two authority sources can disagree.
2. Some code treats any taskraft user as sufficiently privileged; other code requires admin/superadmin.
3. Legacy role strings coexist with accessLevel: super_admin, admin_user, supervisor versus superadmin/admin/standard.
4. src/lib/acess.ts canApprove allows power_user or superadmin, which is too generic to be a security rule for unrelated actions.
5. Several EDO pages correctly scope queries, but some Taskraft paths load entire collections. This is acceptable only for authorized Taskraft server/admin use; it should not be a general client pattern.
6. Direct browser writes make Firestore rules carry too much business authorization logic.
7. Firestore rules are not currently version-controlled in this repository. A reviewed copy should be added before rules migration begins, but the deployed rules must not be changed merely by adding the file.

## 7. Sequential migration plan

### Step 0 — Freeze and baseline
- Leave deployed Firestore rules unchanged.
- Export/copy the exact current deployed Firestore rules into version control as `firestore.rules.current-baseline` (documentation only initially).
- Record Firebase indexes used by scoped queries.
- Establish test accounts: Taskraft superadmin, Taskraft admin, Taskraft standard/supervisor, EDO A, EDO B, reliever, staff employee.
- Create a security test checklist containing positive and negative tests.

### Step 1 — Canonical server authorization helper
Create a server-only helper that:
- verifies Firebase ID token;
- loads userAccess/{uid};
- requires approved status;
- normalizes userType/accessLevel/accountRole;
- exposes requireTaskraft(), requireAdmin(), requireSuperAdmin(), requireEdo(), requireCompanyScope();
- returns 401 versus 403 consistently;
- never trusts role/access fields from request body.
Do not remove legacy helpers yet.

### Step 2 — Canonical current-user/session API
Add `/api/session` or equivalent for main BizCentral users backed by userAccess. Migrate getCurrentUser() consumers gradually. users remains profile data only. Test every role before removing users-based session lookup.

### Step 3 — User administration first
Move approval/rejection/removal and userAccess sync behind superadmin API. This protects the mechanism that grants all other permissions. Test user lifecycle completely. Only after success consider tightening userAccess client writes.

### Step 4 — Signup authority cleanup
Signup creates Auth identity/profile/pending request only. It must not self-grant effective admin/power-user authorization. Approval API creates effective userAccess. Preserve existing signup UX while changing authority semantics.

### Step 5 — Employee master writes
Move add/edit/bulk upload to Taskraft-authorized APIs. Keep current Firestore rules while Employee Mod tests API path. Verify EDO cannot call endpoints manually. Then tighten employees writes for browser clients.

### Step 6 — Attendance writes and scoped reads
Move attendance exception and weekend work mutation to API. Test EDO A cannot touch EDO B; future date rejected; employee/company mismatch rejected. Then tighten attendanceExceptions/attendanceRecords client writes.

### Step 7 — Leave creation/listing
Move main BizCentral leave add/list to API and reuse existing server review/document patterns. Test EDO scope and Taskraft scope. Then tighten leaveRequests client writes as appropriate while staff API continues through Admin SDK.

### Step 8 — Invoicing
Replace src/data/invoicing.ts Firestore writes with API calls. Server determines rate, amount, actor and timestamps. Implement ownership/status transition rules. Persist rate matrix authoritatively. This is a major security/business-integrity migration and should be tested separately before reliever UI expansion.

### Step 9 — Admin master-data imports
Migrate companies, EDO upload, reliever upload, signup-company sync and similar master-data writes. Browser performs parsing/preview; API commits validated normalized data.

### Step 10 — Crate & Dolly privileged writes
Move recon import commit and replacement rates to APIs. Keep current client scoped read temporarily, then migrate reads when driver/schedule API is built. Tighten crate client writes only after import/settings tests pass.

### Step 11 — Payslip/admin import hardening
Confirm all payslip import/storage mutations are server-authorized by accountRole/admin and no privileged browser Firestore/storage writes remain. Keep EDO/staff retrieval APIs.

### Step 12 — Consolidate existing good APIs
Refactor duplicated token/userAccess logic in month-end, admin messages, leave review/document, profile changes, payslips into the canonical helper. Behaviour should not change; regression test each endpoint.

### Step 13 — Firestore rule tightening by collection
Only now tighten rules collection-by-collection. Never replace all rules at once. For each collection:
1. confirm all necessary UI operations use API;
2. add restrictive rule in Employee Mod/test environment;
3. run positive/negative role matrix;
4. deploy that rule change;
5. monitor;
6. move to next collection.

### Step 14 — Remove legacy authority code
After no consumers depend on it:
- retire users-based getCurrentUser authorization;
- remove/rename src/lib/acess.ts legacy security helpers;
- remove unused direct Firestore write imports;
- remove old role aliases from security decisions after data normalization;
- remove development endpoints such as staff/admin-test if no longer needed.

## 8. Recommended rule-tightening order

Lowest blast radius / clearest privileged collections first, then operational collections:
1. userAccess writes
2. crateReplacementRates writes
3. employee master writes
4. attendanceExceptions / attendanceRecords writes
5. leaveRequests privileged transitions
6. invoices writes
7. companies/routes/relievers master writes
8. crateReconDaily writes
9. payslip/import/storage mutations
10. remaining miscellaneous collections

Reads should be tightened separately where server APIs replace browser reads.

## 9. Test matrix required before every rules change

For each migrated action test:
- unauthenticated request -> denied;
- authenticated but no userAccess -> denied;
- status pending/rejected/removed -> denied;
- wrong userType -> denied;
- correct type but insufficient accessLevel/accountRole -> denied;
- EDO A requesting EDO B resource -> denied;
- manipulated body companyId/edoId -> ignored or denied;
- direct browser Firestore write still works during migration period (until planned rule tightening);
- API allowed scenario succeeds;
- audit fields identify server-verified actor;
- after rule tightening: old direct client write is denied while API still succeeds.

For staff endpoints additionally test expired/missing session, employee mismatch and route/schedule scope where applicable.

## 10. Change-control rules for this migration

- All development commits use `[skip netlify]` until explicit deployment approval.
- Do not alter deployed Firestore rules during application migration without explicit sign-off.
- Do not weaken an existing rule to make a new API/UI work.
- Do not use UI hiding as evidence of authorization.
- Do not trust companyId, userType, accessLevel, amount, rate, actor UID/name or approval status from the client when the server can derive it.
- Prefer additive API migration: new path -> test -> switch UI -> test -> tighten rules -> remove old path.
- Document every migration step and test result in this file or a linked security change log.

## 11. Audit checkpoint

This document was created after reviewing the repository tree, API tree, core Firebase/admin/session helpers, user administration, userAccess sync, People/employee master, attendance, leave, invoicing data layer/rates, month-end, truck lease, crate upload/settings, EDO payslips and representative admin APIs.

Before implementing each numbered step, re-open this audit, compare the current branch against it, and update the audit/change log if the code has evolved.
