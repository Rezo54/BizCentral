# Gate 1 Firestore Rules Test Harness

This harness tests the Gate 1 `userAccess` candidate against the local Firebase Firestore Emulator only.

It does **not** connect to production Firebase, use production credentials, modify live data, deploy rules, or trigger Netlify.

## Run locally

From `security-tests/gate1`:

```powershell
npm install
npm test
```

The test seeds emulator-only `userAccess` records with security rules disabled, then verifies:

- a normal user can still read their own `userAccess`;
- a normal user cannot read another user's `userAccess`;
- a Superadmin can still list `userAccess`;
- browser create/update/delete is denied;
- self privilege escalation is denied;
- cross-user mutation is denied;
- even Superadmin browser mutation is denied.

Application workflow tests (signup, approve/reject/remove, sync and normal login/session) remain a separate human validation step because those exercise the Next.js APIs, not just Firestore rules.
