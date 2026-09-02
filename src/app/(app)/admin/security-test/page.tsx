'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

type TestResult = {
  httpStatus: number | null;
  body: any;
  error: string | null;
};

export default function SecuritySessionTestPage() {
  const [authReady, setAuthReady] = useState(false);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult>({ httpStatus: null, body: null, error: null });

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setSignedInEmail(user?.email ?? null);
      setAuthReady(true);
    });
  }, []);

  async function runTest() {
    setLoading(true);
    setResult({ httpStatus: null, body: null, error: null });

    try {
      const user = auth.currentUser;
      if (!user) {
        setResult({ httpStatus: null, body: null, error: 'No Firebase user is currently signed in.' });
        return;
      }

      const token = await user.getIdToken(true);
      const response = await fetch('/api/session', {
        method: 'GET',
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });

      let body: any = null;
      try {
        body = await response.json();
      } catch {
        body = { error: 'Response was not valid JSON.' };
      }

      setResult({ httpStatus: response.status, body, error: null });
    } catch (error) {
      setResult({
        httpStatus: null,
        body: null,
        error: error instanceof Error ? error.message : 'Session test failed.',
      });
    } finally {
      setLoading(false);
    }
  }

  const user = result.body?.user;
  const passed = result.httpStatus === 200 && result.body?.ok === true;

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Canonical Session Security Test</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Temporary Employee Mod diagnostic for Security Migration Step 1B. This page reads the current Firebase session and calls the new server-authorized /api/session endpoint. It does not write to Firestore.
        </p>
      </div>

      <section className="rounded-lg border p-4">
        <div className="text-sm font-medium">Browser authentication</div>
        <div className="mt-2 text-sm">
          {!authReady ? 'Checking Firebase session…' : signedInEmail ? `Signed in as ${signedInEmail}` : 'Not signed in'}
        </div>
      </section>

      <button
        type="button"
        onClick={runTest}
        disabled={!authReady || !signedInEmail || loading}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {loading ? 'Testing…' : 'Run Canonical Session Test'}
      </button>

      {(result.httpStatus !== null || result.error) && (
        <section className="space-y-4 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-semibold">Result</h2>
            <span className="text-sm font-semibold">{passed ? 'PASS' : 'CHECK'}</span>
          </div>

          {result.error ? (
            <div className="text-sm">Client error: {result.error}</div>
          ) : (
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div><dt className="font-medium">HTTP Status</dt><dd>{result.httpStatus}</dd></div>
              <div><dt className="font-medium">Status</dt><dd>{user?.status ?? result.body?.error ?? '—'}</dd></div>
              <div><dt className="font-medium">User Type</dt><dd>{user?.userType ?? '—'}</dd></div>
              <div><dt className="font-medium">Access Level</dt><dd>{user?.accessLevel ?? '—'}</dd></div>
              <div><dt className="font-medium">Account Role</dt><dd>{user?.accountRole ?? '—'}</dd></div>
              <div><dt className="font-medium">Company</dt><dd>{user?.companyId ?? '—'}</dd></div>
              <div><dt className="font-medium">Name</dt><dd>{user?.name ?? '—'}</dd></div>
              <div><dt className="font-medium">Email</dt><dd>{user?.email ?? '—'}</dd></div>
            </dl>
          )}

          <details>
            <summary className="cursor-pointer text-sm font-medium">Raw sanitized response</summary>
            <pre className="mt-3 overflow-auto rounded-md border p-3 text-xs">{JSON.stringify(result.body, null, 2)}</pre>
          </details>
        </section>
      )}

      <section className="rounded-lg border p-4 text-sm">
        <div className="font-medium">Expected Superadmin result</div>
        <div className="mt-2">HTTP 200 · approved · taskraft · superadmin</div>
      </section>
    </main>
  );
}
