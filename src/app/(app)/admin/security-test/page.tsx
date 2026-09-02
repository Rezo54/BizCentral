'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

type TestResult = {
  label: string;
  expected: string;
  httpStatus: number | null;
  body: any;
  error: string | null;
  passed: boolean;
};

export default function SecuritySessionTestPage() {
  const [authReady, setAuthReady] = useState(false);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);

  useEffect(() => onAuthStateChanged(auth, (user) => {
    setSignedInEmail(user?.email ?? null);
    setAuthReady(true);
  }), []);

  async function requestJson(label: string, expected: string, url: string, method: 'GET' | 'PATCH', authorization?: string, expectStatus = 200, body?: unknown) {
    try {
      const headers: Record<string, string> = {};
      if (authorization !== undefined) headers.Authorization = authorization;
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const response = await fetch(url, {
        method,
        cache: 'no-store',
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      let responseBody: any = null;
      try { responseBody = await response.json(); } catch { responseBody = { error: 'Response was not valid JSON.' }; }
      return { label, expected, httpStatus: response.status, body: responseBody, error: null, passed: response.status === expectStatus } as TestResult;
    } catch (error) {
      return { label, expected, httpStatus: null, body: null, error: error instanceof Error ? error.message : 'Request failed.', passed: false } as TestResult;
    }
  }

  async function runApprovedAccountTest() {
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        setResults([{ label: 'Approved account', expected: '200 approved canonical session', httpStatus: null, body: null, error: 'No Firebase user is currently signed in.', passed: false }]);
        return;
      }
      const token = await user.getIdToken(true);
      const result = await requestJson('Approved current account', 'HTTP 200 with approved canonical user', '/api/session', 'GET', `Bearer ${token}`, 200);
      result.passed = result.passed && result.body?.ok === true && result.body?.user?.status === 'approved';
      setResults([result]);
    } finally { setLoading(false); }
  }

  async function runSafeNegativeTests() {
    setLoading(true);
    try {
      const noToken = await requestJson('Missing token', 'HTTP 401 Unauthorized', '/api/session', 'GET', undefined, 401);
      noToken.passed = noToken.passed && noToken.body?.ok === false && noToken.body?.error === 'Unauthorized';

      const malformed = await requestJson('Malformed token', 'HTTP 401 Unauthorized', '/api/session', 'GET', 'Bearer this-is-not-a-valid-firebase-token', 401);
      malformed.passed = malformed.passed && malformed.body?.ok === false && malformed.body?.error === 'Unauthorized';

      const wrongScheme = await requestJson('Wrong authorization scheme', 'HTTP 401 Unauthorized', '/api/session', 'GET', 'Basic deliberately-invalid', 401);
      wrongScheme.passed = wrongScheme.passed && wrongScheme.body?.ok === false && wrongScheme.body?.error === 'Unauthorized';

      setResults([noToken, malformed, wrongScheme]);
    } finally { setLoading(false); }
  }

  async function runUserAdminBoundaryTests() {
    setLoading(true);
    try {
      const tests: TestResult[] = [];

      const noToken = await requestJson('User Admin — missing token', 'HTTP 401 Unauthorized', '/api/admin/users', 'GET', undefined, 401);
      noToken.passed = noToken.passed && noToken.body?.ok === false;
      tests.push(noToken);

      const malformed = await requestJson('User Admin — malformed token', 'HTTP 401 Unauthorized', '/api/admin/users', 'GET', 'Bearer deliberately-invalid', 401);
      malformed.passed = malformed.passed && malformed.body?.ok === false;
      tests.push(malformed);

      const current = auth.currentUser;
      if (current) {
        const token = await current.getIdToken(true);
        const currentResult = await requestJson(
          'User Admin — current account',
          'Superadmin: HTTP 200. Any other approved account: HTTP 403.',
          '/api/admin/users',
          'GET',
          `Bearer ${token}`,
          200
        );
        currentResult.passed = currentResult.httpStatus === 200 || currentResult.httpStatus === 403;
        tests.push(currentResult);

        // Deliberately malformed PATCH request. Reuse the same authenticated
        // identity/token so no second block-scoped declaration is required.
        const patchResult = await requestJson(
          'User Admin — non-mutating PATCH boundary',
          'Superadmin: HTTP 400 invalid request. Non-superadmin: HTTP 403. No Firestore write.',
          '/api/admin/users',
          'PATCH',
          `Bearer ${token}`,
          400,
          { decision: 'not-a-real-decision', userId: '' }
        );
        patchResult.passed = patchResult.httpStatus === 400 || patchResult.httpStatus === 403;
        tests.push(patchResult);
      }

      setResults(tests);
    } finally { setLoading(false); }
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">BizCentral Security Test</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Temporary Employee Mod diagnostic for canonical session and user-administration authorization. Safe boundary tests do not approve, reject, remove or modify users.
        </p>
      </div>

      <section className="rounded-lg border p-4">
        <div className="text-sm font-medium">Browser authentication</div>
        <div className="mt-2 text-sm">{!authReady ? 'Checking Firebase session…' : signedInEmail ? `Signed in as ${signedInEmail}` : 'Not signed in'}</div>
      </section>

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={runApprovedAccountTest} disabled={!authReady || !signedInEmail || loading} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {loading ? 'Testing…' : 'Test Current Approved Account'}
        </button>
        <button type="button" onClick={runSafeNegativeTests} disabled={loading} className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50">
          {loading ? 'Testing…' : 'Run Session Negative Tests'}
        </button>
        <button type="button" onClick={runUserAdminBoundaryTests} disabled={loading} className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50">
          {loading ? 'Testing…' : 'Test User Admin Boundary'}
        </button>
      </div>

      {results.length > 0 && (
        <section className="space-y-4">
          {results.map((result) => (
            <div key={result.label} className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-4">
                <h2 className="font-semibold">{result.label}</h2>
                <span className="text-sm font-semibold">{result.passed ? 'PASS' : 'CHECK'}</span>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div><div className="font-medium">Expected</div><div>{result.expected}</div></div>
                <div><div className="font-medium">HTTP Status</div><div>{result.httpStatus ?? '—'}</div></div>
                <div className="sm:col-span-2"><div className="font-medium">Server response</div><div>{result.error ?? result.body?.error ?? (result.body?.ok ? 'Authorized response returned' : '—')}</div></div>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium">Raw sanitized response</summary>
                <pre className="mt-3 overflow-auto rounded-md border p-3 text-xs">{JSON.stringify(result.body, null, 2)}</pre>
              </details>
            </div>
          ))}
        </section>
      )}

      <section className="rounded-lg border p-4 text-sm">
        <div className="font-medium">Safety boundary</div>
        <p className="mt-2">These controls deliberately avoid real user lifecycle mutations. Pending/rejected/missing-userAccess tests use naturally available test accounts. Actual approve/reject/remove testing is performed only after the admin UI has been switched to the server API and a disposable test user is selected.</p>
      </section>
    </main>
  );
}
