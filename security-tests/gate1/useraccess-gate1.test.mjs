import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  getDocs,
  collection,
  setDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';

const projectId = 'demo-bizcentral-gate1';
const rules = await fs.readFile(
  new URL('../../docs/security/firestore.rules.candidate-gate-1-userAccess', import.meta.url),
  'utf8'
);

const env = await initializeTestEnvironment({
  projectId,
  firestore: { rules },
});

try {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'userAccess', 'normal-user'), {
      uid: 'normal-user',
      name: 'Normal User',
      email: 'normal@example.test',
      status: 'approved',
      userType: 'edo',
      accessLevel: 'standard',
      companyId: 'company-a',
    });
    await setDoc(doc(db, 'userAccess', 'super-user'), {
      uid: 'super-user',
      name: 'Super User',
      email: 'super@example.test',
      status: 'approved',
      userType: 'taskraft',
      accessLevel: 'superadmin',
    });
    await setDoc(doc(db, 'userAccess', 'other-user'), {
      uid: 'other-user',
      status: 'approved',
      userType: 'edo',
      accessLevel: 'standard',
      companyId: 'company-b',
    });
  });

  const normalDb = env.authenticatedContext('normal-user').firestore();
  const superDb = env.authenticatedContext('super-user').firestore();

  // Existing Gate 1 read semantics must remain intact.
  await assertSucceeds(getDoc(doc(normalDb, 'userAccess', 'normal-user')));
  await assertFails(getDoc(doc(normalDb, 'userAccess', 'other-user')));
  await assertSucceeds(getDocs(collection(superDb, 'userAccess')));

  // Gate 1: all browser mutations must be denied, including self and Superadmin.
  await assertFails(setDoc(doc(normalDb, 'userAccess', 'new-user'), {
    uid: 'new-user',
    status: 'pending',
    accessLevel: 'pending',
    userType: 'edo',
  }));
  await assertFails(updateDoc(doc(normalDb, 'userAccess', 'normal-user'), {
    accessLevel: 'superadmin',
  }));
  await assertFails(updateDoc(doc(normalDb, 'userAccess', 'other-user'), {
    companyId: 'company-a',
  }));
  await assertFails(deleteDoc(doc(normalDb, 'userAccess', 'normal-user')));
  await assertFails(updateDoc(doc(superDb, 'userAccess', 'normal-user'), {
    status: 'removed',
  }));
  await assertFails(deleteDoc(doc(superDb, 'userAccess', 'normal-user')));

  assert.ok(true);
  console.log('PASS: Gate 1 userAccess candidate rules preserve reads and deny all client mutations.');
} finally {
  await env.cleanup();
}
