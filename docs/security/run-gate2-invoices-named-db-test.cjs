'use strict';

const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

const PROJECT_ID = 'demo-bizcentral-rules';
const DATABASE_ID = 'biz-central';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const TEST_PASSWORD = 'LocalOnly-Invoice-RuleTest-123!';

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
process.env.GCLOUD_PROJECT = PROJECT_ID;

const firestoreBase = `http://${FIRESTORE_HOST}/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;
const authBase = `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1`;

function fail(message) { throw new Error(message); }

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  return { response, body };
}

async function createAuthUser(label) {
  const email = `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  const { response, body } = await jsonRequest(`${authBase}/accounts:signUp?key=fake-api-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: TEST_PASSWORD, returnSecureToken: true }),
  });
  if (!response.ok || !body?.idToken || !body?.localId) {
    fail(`Auth emulator signup failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return { uid: body.localId, token: body.idToken };
}

function fields(values) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [
    key,
    typeof value === 'number' ? { integerValue: String(value) } : { stringValue: String(value) },
  ]));
}

function clientDoc(method, invoiceId, token, values) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (values) headers['content-type'] = 'application/json';
  return jsonRequest(`${firestoreBase}/invoices/${encodeURIComponent(invoiceId)}`, {
    method,
    headers,
    body: values ? JSON.stringify({ fields: fields(values) }) : undefined,
  });
}

function clientList(token) {
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  return jsonRequest(`${firestoreBase}/invoices?pageSize=10`, { headers });
}

async function expectDenied(label, promise) {
  const { response, body } = await promise;
  if (![401, 403].includes(response.status)) {
    fail(`${label}: expected 401/403 but received ${response.status}: ${JSON.stringify(body)}`);
  }
  console.log(`PASS ${label} -> ${response.status}`);
}

async function main() {
  if (!firestoreBase.includes(`/databases/${DATABASE_ID}/`)) {
    fail('Refusing to run: Firestore target is not the named biz-central database.');
  }

  console.log(`Gate 2 target: ${firestoreBase}`);
  console.log('Production credentials are not used; this test requires Firebase emulators only.');

  const app = initializeApp({ projectId: PROJECT_ID }, `gate2-${Date.now()}`);
  const adminDb = getFirestore(app, DATABASE_ID);
  const adminAuth = getAuth(app);
  const users = [];
  const invoiceIds = ['reliever-pending', 'reliever-approved', 'other-pending'];

  try {
    const reliever = await createAuthUser('reliever'); users.push(reliever);
    const otherReliever = await createAuthUser('other-reliever'); users.push(otherReliever);
    const edo = await createAuthUser('edo'); users.push(edo);
    const superadmin = await createAuthUser('superadmin'); users.push(superadmin);

    await adminDb.doc('invoices/reliever-pending').set({
      relieverUserId: reliever.uid, relieverCompanyId: 'reliever-a', edoId: 'edo-a', status: 'pending', amount: 470,
    });
    await adminDb.doc('invoices/reliever-approved').set({
      relieverUserId: reliever.uid, relieverCompanyId: 'reliever-a', edoId: 'edo-a', status: 'approved', amount: 470,
    });
    await adminDb.doc('invoices/other-pending').set({
      relieverUserId: otherReliever.uid, relieverCompanyId: 'reliever-b', edoId: 'edo-b', status: 'pending', amount: 590,
    });

    await expectDenied('unauthenticated invoice get is denied', clientDoc('GET', 'reliever-pending'));
    await expectDenied('unauthenticated invoice list is denied', clientList());
    await expectDenied('reliever direct own invoice get is denied', clientDoc('GET', 'reliever-pending', reliever.token));
    await expectDenied('reliever direct invoice list is denied', clientList(reliever.token));
    await expectDenied('reliever direct invoice create is denied', clientDoc('PATCH', 'new-invoice', reliever.token, {
      relieverUserId: reliever.uid, edoId: 'edo-a', status: 'pending', amount: 470,
    }));
    await expectDenied('reliever direct own pending update is denied', clientDoc('PATCH', 'reliever-pending', reliever.token, { status: 'pending', amount: 1 }));
    await expectDenied('reliever direct own pending delete is denied', clientDoc('DELETE', 'reliever-pending', reliever.token));
    await expectDenied('reliever direct approved delete is denied', clientDoc('DELETE', 'reliever-approved', reliever.token));
    await expectDenied('reliever direct cross-owner get is denied', clientDoc('GET', 'other-pending', reliever.token));
    await expectDenied('EDO direct invoice get is denied', clientDoc('GET', 'reliever-pending', edo.token));
    await expectDenied('EDO direct invoice list is denied', clientList(edo.token));
    await expectDenied('EDO direct approval update is denied', clientDoc('PATCH', 'reliever-pending', edo.token, { status: 'approved' }));
    await expectDenied('superadmin direct invoice get is denied', clientDoc('GET', 'reliever-pending', superadmin.token));
    await expectDenied('superadmin direct invoice list is denied', clientList(superadmin.token));
    await expectDenied('superadmin direct approval update is denied', clientDoc('PATCH', 'reliever-pending', superadmin.token, { status: 'approved' }));
    await expectDenied('superadmin direct invoice delete is denied', clientDoc('DELETE', 'reliever-pending', superadmin.token));

    console.log('Gate 2 named-database invoice rule test PASS.');
  } finally {
    await Promise.all(invoiceIds.concat('new-invoice').map((id) => adminDb.doc(`invoices/${id}`).delete().catch(() => {})));
    await Promise.all(users.map((user) => adminAuth.deleteUser(user.uid).catch(() => {})));
    await deleteApp(app);
  }
}

main().catch((error) => {
  console.error('Gate 2 named-database invoice rule test FAILED.');
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
