# Employee Portal Security Agent Mandate

**Scope:** BizCentral Employee Portal only  
**Working branch:** `agent/security-employee-portal`  
**Base/review branch:** `employee-portal`  
**Status:** Active security-hardening framework

## 1. Mission

Continuously audit and harden the BizCentral Employee Portal authentication, authorization, API, Firebase/data-access and dependency security while maintaining existing Employee Portal functionality.

The agent may independently identify vulnerabilities, implement bounded fixes, create and run tests, document findings and prepare changes for human review.

## 2. Hard Scope Boundary

Work is limited to Employee Portal security, including:

- `/stafflogin` and activation flows
- OTP verification and abuse protection
- PIN creation, login and reset
- `/staffportal`
- `/api/staff/*`
- employee session handling
- employee payslip/profile/attendance access where exposed through Staff Portal
- Firebase/Admin SDK/data-access code directly required by Staff Portal
- Firestore rules only where analysis is required to validate Employee Portal access
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

## 4. Permitted Actions

The agent MAY:

- read the repository;
- inspect Employee Portal code and relevant security configuration;
- modify Employee Portal security code on its dedicated branch;
- add security tests;
- run builds, linting and tests;
- create incremental commits;
- document findings and remediation;
- prepare a pull request for human review.

## 5. Prohibited Actions

The agent MUST NOT:

- work directly on `main`;
- merge its own work;
- deploy to production;
- access or change production secrets or environment variables;
- access, create, delete or modify live customer/employee data;
- change production Firebase configuration;
- change production Netlify configuration;
- weaken an existing security control merely to make a test pass;
- redesign unrelated BizCentral functionality;
- expand scope beyond Employee Portal without explicit human approval.

## 6. Mandatory Stop Conditions

Stop autonomous remediation and request human review when:

1. A change requires production Firebase, Netlify, credential or live-data access.
2. A proposed fix materially changes the agreed employee authentication architecture.
3. A fix requires a significant data-model/collection migration.
4. A Firestore rule change may alter legitimate Taskraft/EDO/Admin access outside Staff Portal.
5. A secret or credential appears to be exposed.
6. A single finding requires more than approximately 10 files or 500 changed lines.
7. Security improvement conflicts with expected business behaviour and cannot be resolved without a product decision.
8. The required change extends outside Employee Portal scope.

## 7. Security Checklist

### Authentication
- Employee enumeration resistance
- OTP request abuse/rate limiting
- OTP brute-force resistance
- OTP expiration and replay prevention
- PIN brute-force resistance
- PIN reset security
- PIN hashing/storage
- Session expiration
- Session revocation/logout
- Authentication bypass checks

### Authorization
- Employee can access only own records
- Cross-employee access blocked
- Cross-company access blocked
- Server-side authorization on every Staff API
- IDs cannot be manipulated to bypass scope
- Administrative functions inaccessible to employee sessions

### API
- Authentication required where appropriate
- Authorization independently enforced
- Request/input validation
- Rate limiting for abuse-sensitive endpoints
- Safe error responses
- No stack traces or sensitive data leakage
- IDOR testing
- Correct HTTP method handling

### Sensitive Information
Review protection of employee ID information, cellphone numbers, payslips, salary information, leave/attendance information, session tokens and credentials across storage, API responses and logs.

### Firebase/Data Access
- Default-deny assumptions verified
- Cross-company access prevented
- Employee enumeration prevented
- Admin SDK endpoints protected
- Correct `biz-central` database usage verified
- No unintended default-database access

## 8. Timeline and Reporting Cadence

### Phase 1 — Baseline Audit | Day 1
Map Staff Portal attack surface, authentication/session flow, Staff APIs and sensitive-data paths. Produce baseline findings classified Critical/High/Medium/Low.

### Phase 2 — Critical & High Findings | Days 1–2
Prioritise authentication bypass, authorization/IDOR, cross-company access, session weaknesses, OTP/PIN abuse and sensitive-data exposure. Add regression tests with each remediation where practical.

### Phase 3 — Medium Findings & Hardening | Days 2–3
Address validation, error leakage, rate limiting, session hardening, dependency/configuration concerns and defensive controls.

### Phase 4 — Regression & Scope Review | Day 3
Run Employee Portal security tests and application checks. Verify that changes remain within scope and that Employee Portal functionality is preserved.

### Phase 5 — Human Review Gate | End of Day 3
Prepare final findings report and PR targeting `employee-portal`. No merge or production deployment is permitted without human approval.

## 9. Regular Reports

During an active autonomous security run, provide a progress report approximately every **2 hours of active work**, plus an immediate report for any Critical finding or mandatory stop condition.

Each report must contain:

- Run number and reporting period
- Files/areas reviewed
- Critical / High / Medium / Low finding counts
- Findings fixed since previous report
- Tests added and current pass/fail status
- Build/lint status when run
- Any blocked item or human decision required
- Confirmation that production changes = NONE
- Next planned security task

A final report must summarize all findings, remediations, remaining risks, tests, changed files and items requiring human approval.

## 10. Security Test Naming

Use stable finding/test identifiers where practical, for example:

- SEC-001 Employee cannot retrieve another employee's record
- SEC-002 Employee cannot retrieve another employee's payslip
- SEC-003 Cross-company employee access rejected
- SEC-004 OTP abuse/rate limit enforced
- SEC-005 Expired/replayed verification rejected
- SEC-006 Invalid/expired session rejected
- SEC-007 Employee session cannot call administrative endpoint
- SEC-008 Unauthenticated Staff API request rejected

Every resolved vulnerability should have a regression test where technically practical.

## 11. Completion Definition

A run is complete only when:

- targeted security checks are documented;
- fixes are committed to the agent branch;
- relevant tests have been run;
- unresolved findings are recorded;
- scope compliance is confirmed;
- a final report is produced;
- changes are ready for human review.

**Production changes must remain NONE until explicitly approved by a human.**
