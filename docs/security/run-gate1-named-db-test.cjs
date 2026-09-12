'use strict';

const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const PROJECT_ID = 'demo-bizcentral-rules';
const DATABASE_ID = 'biz-central';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
process.env.GCLOUD_PROJECT = PROJECT_ID;

const firestoreBase = `http://${FIRESTORE_HOST}/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;
const authBase = `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1`;

function fail(message) {
  throw new Error(message);
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { response, body };
}

async function createAuthUser(label) {
  const email = `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  const { response, body } = await jsonRequest(`${authBase}/accounts:signUp?key=fake-api-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      password: 'LocalOnly-RuleTest-123!',
      returnSecureToken: true,
    }),
  });

  if (!response.ok || !body?.idToken || !body?.localId) {
    fail(`Auth emulator signup failed (${response.status}): ${JSON.stringify(body)}`);
  }

  return { uid: body.localId, token: body.idToken };
}

function userAccessFixture(uid, accessLevel = 'standard') {
  return {
    uid,
    name: `Gate1 ${accessLevel}`,
    status: 'approved',
    userType: 'taskraft',
    accessLevel,
    companyId: 'taskraft',
  };
}

function firestoreFields(values) {
  const out = {};
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'string') out[key] = { stringValue: value };
    else if (typeof value === 'boolean') out[key] = { booleanValue: value };
    else fail(`Unsupported fixture value for ${key}`);
  }
  return out;
}

async function clientDoc(method, uid, token, fields) {
  const url = `${firestoreBase}/userAccess/${encodeURIComponent(uid)}`;
  const headers = { authorization: `Bearer ${token}` };
  if (fields) headers['content-type'] = 'application/json';

  return jsonRequest(url, {
    method,
    headers,
    body: fields ? JSON.stringify({ fields }) : undefined,
  });
}

async function expectStatus(label, requestPromise, allowedStatuses) {
  const { response, body } = await requestPromise;
  if (!allowedStatuses.includes(response.status)) {
    fail(
      `${label}: expected ${allowedStatuses.join('/')} but received ${response.status}: ${JSON.stringify(body)}`,
    );
  }
  console.log(`PASS ${label} -> ${response.status}`);
}

async function main() {
  if (!firestoreBase.includes(`/databases/${DATABASE_ID}/`)) {
    fail('Refusing to run: Firestore target is not the named biz-central database.');
  }

  console.log(`Gate 1 target: ${firestoreBase}`);
  console.log('Production credentials are not used; this test requires Firebase emulators only.');

  const app = initializeApp({ projectId: PROJECT_ID }, `gate1-${Date.now()}`);
  const adminDb = getFirestore(app, DATABASE_ID);
  const createdUsers = [];

  try {
    const ordinary = await createAuthUser('ordinary');
    createdUsers.push(ordinary);
    const creator = await createAuthUser('creator');
    createdUsers.push(creator);
    const superadmin = await createAuthUser('superadmin');
    createdUsers.push(superadmin);
    const other = await createAuthUser('other');
    createdUsers.push(other);

    // Firebase Admin talks only to the emulator and is used solely for local fixtures.
    // Client-rule assertions below use Auth-emulator ID tokens over Firestore REST.
    await adminDb.doc(`userAccess/${ordinary.uid}`).set(userAccessFixture(ordinary.uid, 'standard'));
    await adminDb.doc(`userAccess/${superadmin.uid}`).set(userAccessFixture(superadmin.uid, 'superadmin'));
    await adminDb.doc(`userAccess/${other.uid}`).set(userAccessFixture(other.uid, 'standard'));

    await expectStatus(
      'own userAccess get remains allowed',
      clientDoc('GET', ordinary.uid, ordinary.token),
      [200],
    );

    await expectStatus(
      'ordinary user cannot read another userAccess document',
      clientDoc('GET', other.uid, ordinary.token),
      [403],
    );

    await expectStatus(
      'ordinary user cannot create own userAccess document',
      clientDoc(
        'PATCH',
        creator.uid,
        creator.token,
        firestoreFields(userAccessFixture(creator.uid, 'standard')),
      ),
      [403],
    );

    await expectStatus(
      'ordinary user cannot elevate own userAccess role',
      clientDoc(
        'PATCH',
        ordinary.uid,
        ordinary.token,
        firestoreFields({ accessLevel: 'superadmin' }),
      ),
      [403],
    );

    await expectStatus(
      'ordinary user cannot mutate another userAccess document',
      clientDoc(
        'PATCH',
        other.uid,
        ordinary.token,
        firestoreFields({ status: 'approved', accessLevel: 'superadmin' }),
      ),
      [403],
    );

    await expectStatus(
      'ordinary user cannot delete own userAccess document',
      clientDoc('DELETE', ordinary.uid, ordinary.token),
      [403],
    );

    const listUrl = `${firestoreBase}/userAccess?pageSize=10`;

    await expectStatus(
      'superadmin list remains allowed',
      jsonRequest(listUrl, {
        headers: { authorization: `Bearer ${superadmin.token}` },
      }),
      [200],
    );

    await expectStatus(
      'ordinary user list remains denied',
      jsonRequest(listUrl, {
        headers: { authorization: `Bearer ${ordinary.token}` },
      }),
      [403],
    );

    await expectStatus(
      'superadmin browser update is denied under Gate 1 candidate',
      clientDoc(
        'PATCH',
        ordinary.uid,
        superadmin.token,
        firestoreFields({ status: 'approved' }),
      ),
      [403],
    );

    console.log('Gate 1 named-database rule test PASS.');
  } finally {
    await Promise.all(
      createdUsers.map((user) =>
        adminDb.doc(`userAccess/${user.uid}`).delete().catch(() => {}),
      ),
    ).catch(() => {});
    await deleteApp(app);
  }
}

main().catch((error) => {
  console.error('Gate 1 named-database rule test FAILED.');
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
