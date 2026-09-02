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

  async function requestSession(label: string, expected: string, authorization?: string, expectStatus = 200) {
    try {
      const headers: Record<string, string> = {};
      if (authorization !== undefined) headers.Authorization = authorization;
      const response = await fetch('/api/session', { method: 'GET', cache: 'no-store', headers });
      let body: any = null;
      try { body = await response.json(); } catch { body = { error: 'Response was not valid JSON.' }; }
      return { label, expected, httpStatus: response.status, body, error: null, passed: response.status === expectStatus } as TestResult;
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
      const result = await requestSession('Approved current account', 'HTTP 200 with approved canonical user', `Bearer ${token}`, 200);
      result.passed = result.passed && result.body?.ok === true && result.body?.user?.status === 'approved';
      setResults([result]);
    } finally { setLoading(false); }
  }

  async function runSafeNegativeTests() {
    setLoading(true);
    try {
      const noToken = await requestSession('Missing token', 'HTTP 401 Unauthorized', undefined, 401);
      noToken.passed = noToken.passed && noToken.body?.ok === false && noToken.body?.error === 'Unauthorized';

      const malformed = await requestSession('Malformed token', 'HTTP 401 Unauthorized', 'Bearer this-is-not-a-valid-firebase-token', 401);
      malformed.passed = malformed.passed && malformed.body?.ok === false && malformed.body?.error === 'Unauthorized';

      const wrongScheme = await requestSession('Wrong authorization scheme', 'HTTP 401 Unauthorized', 'Basic deliberately-invalid', 401);
      wrongScheme.passed = wrongScheme.passed && wrongScheme.body?.ok === false && wrongScheme.body?.error === 'Unauthorized';

      setResults([noToken, malformed, wrongScheme]);
    } finally { setLoading(false); }
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Canonical Session Security Test</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Temporary Employee Mod diagnostic for Security Migration Steps 1B–1C. These tests call /api/session only. They do not write to Firestore or change userAccess records.
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
          {loading ? 'Testing…' : 'Run Safe Negative Tests'}
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
                <div className="sm:col-span-2"><div className="font-medium">Server response</div><div>{result.error ?? result.body?.error ?? (result.body?.ok ? 'Approved canonical session returned' : '—')}</div></div>
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
        <div className="font-medium">Step 1C safety boundary</div>
        <p className="mt-2">This page deliberately does not create, delete, reject, suspend or modify a userAccess record. Pending/rejected/missing-userAccess tests must use naturally available test accounts or a later isolated test fixture, never a live approved account.</p>
      </section>
    </main>
  );
}
