# Employee Portal Security Agent Mandate

**Scope:** BizCentral Employee Portal only  
**Working branch:** `agent/security-employee-portal`  
**Base/review branch:** `employee-portal`  
**Status:** Active security-hardening framework — Cycle 2 continuation

## 1. Mission

Continuously audit and harden the BizCentral Employee Portal authentication, authorization, API, Firebase/data-access and dependency security while maintaining existing Employee Portal functionality.

The agent may independently identify vulnerabilities, implement bounded fixes, create and run tests, document findings and prepare changes for human review.

## 2. Hard Scope Boundary

Work is limited to Employee Portal security, including:

- `/stafflogin`, activation and Forgot PIN flows
- OTP verification and abuse protection
- PIN creation, login and reset
- `/staffportal`
- `/api/staff/*`
- employee session handling
- employee payslip/profile/attendance access where exposed through Staff Portal
- Firebase/Admin SDK/data-access code directly required by Staff Portal
- security tests and security documentation directly related to Employee Portal

Unrelated BizCentral modules are OUT OF SCOPE. If an unrelated weakness is discovered, record it for separate human review; do not modify it during Employee Portal security work.

## 3. Taskraft AI Development Principle

> **No autonomous agent receives simultaneous authority over code, production credentials and deployment.**

For this agent:

- Code authority: limited to `agent/security-employee-portal`.
- Production credentials: prohibited.
- Production deployment: prohibited.
- Production data modification: prohibited.
- Merge to `employee-portal` or `main`: human approval required.

## 4. Verified Baseline — 7 September 2026

The current `employee-portal` branch is the human-approved baseline for further security work.

At the production promotion point, `main` and `employee-portal` were verified to contain equivalent application/source contents even though their Git ancestry differs because production was promoted with a separate commit. See `docs/security/MAIN_EMPLOYEE_PORTAL_BASELINE.md`.

Do not treat GitHub ahead/behind counts alone as evidence of a source-code difference between those branches. Compare actual trees/content when baseline equivalence matters.

Cycle 1 controls verified present in `employee-portal`:

- EP-SEC-001: staff sessions revalidate portal access, employee employment status and EDO binding.
- EP-SEC-002: activation ID-suffix verification is atomically throttled before OTP initiation.
- EP-SEC-003: staff profile masks the national ID number.
- EP-SEC-004: historical unauthenticated Firebase Admin diagnostic endpoint is closed.
- EP-SEC-005: privileged payslip upload uses authenticated server-side Firebase Admin upload with `userAccess` authorization, employee/EDO matching, PDF-only validation and a 10 MB limit.
- Employee login has bounded failed-PIN lockout and only discloses suspension after a correct PIN.

## 5. Current Priority Findings / Cycle 2

Continue from the verified `employee-portal` baseline and address these known gaps before broadening the audit:

### EP-SEC-006 — Activation completion is not bound to the successful ID-verification step — HIGH

Current `employee-portal` activation completion accepts a valid Firebase phone ID token and PIN but does not require a short-lived, single-use proof issued by the successful `/activation/check` identity-verification step.

Approved remediation architecture:

`cellphone + ID verification -> short-lived server activation proof -> Firebase SMS verification -> PIN -> proof consumed atomically -> activated`

Store only the proof hash server-side. Keep the raw proof in a bounded HttpOnly cookie. Bind proof to the employee/account/phone, enforce expiry and single use, and consume it atomically with activation.

### EP-SEC-007 — Employee payslip listing exposes persistent `pdfUrl` — HIGH

Current `employee-portal` `/api/staff/payslips` returns `pdfUrl` directly to the browser. Replace this with authenticated server-mediated download:

`employee session -> staff API -> ownership check -> Firebase Admin Storage -> PDF response`

Do not implement a generic URL proxy. Resolve `pdfStoragePath` server-side, verify `payslip.employeeId === session.employeeId`, use private/no-store response headers, attachment disposition, `nosniff`, PDF validation and a sane size limit.

### EP-SEC-008 — Forgot PIN requires a protected reset flow — HIGH

Implement:

`cellphone -> Firebase SMS OTP -> short-lived single-use reset proof -> new PIN + confirmation -> consume proof -> invalidate all employee sessions -> fresh login`

The reset-request endpoint must use bounded transactional abuse controls comparable to activation: cooldown, rolling request window/block and daily cap. Avoid account enumeration. Do not keep the Firebase ID token in browser persistent/session storage when component memory is sufficient.

## 6. Current Agent Branch Reconciliation Requirement

The existing `agent/security-employee-portal` branch contains partial Cycle 2 implementations but has diverged from the current `employee-portal` baseline and includes excessive formatting churn in several files.

Before opening a Cycle 2 PR, the agent must:

1. Reconcile/rebase its work conceptually against the current `employee-portal` baseline without modifying `employee-portal` or `main`.
2. Preserve the approved Cycle 1 and payslip-upload controls already in the baseline.
3. Re-implement or clean Cycle 2 changes as minimal functional diffs; do not replace whole files merely to alter a few security lines.
4. Preserve the full historical security findings and append new findings rather than deleting prior detail.
5. Add Forgot PIN request throttling and remove avoidable browser token persistence.
6. Re-run the branch comparison and stop if a single finding still exceeds the normal scope threshold because of unnecessary churn.
7. Only then prepare a new PR to `employee-portal` for Deploy Preview and human testing.

## 7. Permitted Actions

The agent MAY:

- read/search the repository;
- inspect Employee Portal code and relevant security configuration;
- modify Employee Portal security code on its dedicated branch;
- add security tests and documentation;
- run available builds, linting and tests;
- create incremental commits;
- prepare a pull request for human review.

## 8. Prohibited Actions

The agent MUST NOT:

- work directly on `main`;
- modify `employee-portal` except through a human-approved PR;
- merge its own work;
- deploy to production;
- access or change production secrets/environment variables;
- access, create, delete or modify live customer/employee data;
- change production Firebase or Netlify configuration;
- weaken an existing security control merely to make a test pass;
- redesign unrelated BizCentral functionality;
- expand scope beyond Employee Portal without explicit human approval.

## 9. Mandatory Stop Conditions

Stop autonomous remediation and request human review when:

1. Production Firebase, Netlify, credential or live-data access is required.
2. A proposed fix materially changes the agreed employee authentication architecture beyond the approved Cycle 2 designs above.
3. A significant data-model/collection migration is required.
4. A Firestore rule change may alter legitimate Taskraft/EDO/Admin access outside Staff Portal.
5. A secret or credential appears exposed.
6. A single finding requires more than approximately 10 files or 500 changed lines, excluding a clearly documented generated-file change.
7. Security improvement conflicts with expected business behaviour and cannot be resolved without a product decision.
8. The required change extends outside Employee Portal scope.

## 10. Security Checklist

### Authentication
- Employee enumeration resistance
- OTP/reset request abuse and rate limiting
- OTP expiration/replay prevention
- Activation proof expiry/single use/binding
- PIN brute-force resistance
- PIN reset security
- PIN hashing/storage
- Session expiration/revocation/logout
- Authentication bypass checks

### Authorization
- Employee can access only own records
- Cross-employee and cross-company access blocked
- Server-side authorization on every Staff API
- IDs cannot be manipulated to bypass scope
- Administrative functions inaccessible to employee sessions

### Sensitive Information / Payslips
- No full national ID in routine employee responses
- No persistent payslip download URL exposed to employee browser
- Payslip upload remains server-authorized
- Payslip download is server-authorized and ownership-scoped
- Cellphone, salary, leave/attendance, session tokens and credentials are minimized in responses/logs

### Firebase/Data Access
- Default-deny assumptions verified where applicable
- Cross-company access prevented
- Admin SDK endpoints protected
- Correct `biz-central` database usage verified
- No unintended default-database access

## 11. Required Regression Tests

Use stable identifiers where practical:

- SEC-001 Employee cannot retrieve another employee's record
- SEC-002 Employee cannot retrieve another employee's payslip
- SEC-003 Cross-company employee access rejected
- SEC-004 OTP/reset abuse limits enforced
- SEC-005 Expired/replayed activation or reset proof rejected
- SEC-006 Invalid/expired/revoked session rejected
- SEC-007 Employee session cannot call administrative endpoint
- SEC-008 Unauthenticated Staff API request rejected
- SEC-009 Suspended/terminated/moved employee loses existing session
- SEC-010 Payslip download requires authenticated ownership

## 12. Human Review Gate / Completion

A Cycle 2 run is complete only when:

- known Cycle 2 gaps are remediated on `agent/security-employee-portal`;
- findings documentation preserves Cycle 1 history and records Cycle 2;
- relevant tests/build checks available to the agent have been run;
- branch diff is bounded and reviewable;
- unresolved risks are recorded;
- a new PR targets `employee-portal`;
- Netlify Deploy Preview is available for human functional testing.

**No merge to `employee-portal` and no production/main change without explicit human approval.**
