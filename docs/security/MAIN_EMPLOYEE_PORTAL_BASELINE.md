# Main / Employee Portal Baseline Record

**Recorded:** 7 September 2026  
**Repository:** `Rezo54/BizCentral`

## Verified baseline

At the time this record was created, the actual repository file contents of `main` and `employee-portal` were verified as equivalent.

- `main` HEAD at verification: `ad683c404952683815842ff826349cf477b0a5e4`
- `employee-portal` HEAD at verification: `8559f36b897556e60db2342a5724380bca7e956a`

GitHub may report these branches as diverged or show `main` one commit ahead because the tested Employee Portal baseline was promoted to production using a separate production-promotion commit. This is a **commit-history/ancestry difference**, not a source-content difference at this recorded baseline.

The production promotion commit is:

`ad683c404952683815842ff826349cf477b0a5e4` — **Deploy Employee Portal security hardening to production**

It represents the tested Employee Portal baseline, including the approved Employee Portal security hardening and validated secured payslip-upload path.

## Rule for future branch checks

Do **not** conclude that `main` and `employee-portal` contain different application code solely from GitHub ahead/behind counts.

When evaluating synchronization between these branches:

1. Check commit ancestry/ahead-behind status.
2. If history has diverged because of the production-promotion commit, compare the actual repository trees/file contents.
3. Treat the branches as content-synchronized when their file trees are equivalent, even if their commit SHAs/ancestry differ.
4. Only report a code/configuration difference when the actual file contents differ.

## Security workflow remains unchanged

New Employee Portal security work must continue through:

`agent/security-employee-portal` → PR to `employee-portal` → Deploy Preview/testing → human approval → controlled production promotion.

The existence of this baseline record does not authorize direct Security Agent changes to `main` and does not weaken existing branch protection or human approval requirements.
