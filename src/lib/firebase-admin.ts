// src/lib/firebase-admin.ts

import {
  getApps,
  initializeApp,
  cert,
} from 'firebase-admin/app';

import {
  getFirestore,
} from 'firebase-admin/firestore';

import {
  getAuth,
} from 'firebase-admin/auth';

// =====================================================
// FIREBASE ADMIN
// SERVER SIDE ONLY
// =====================================================

function getAdminApp() {

  if (getApps().length) {
    return getApps()[0];
  }

  const projectId =
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  const clientEmail =
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL;

  const privateKey =
    process.env.FIREBASE_ADMIN_PRIVATE_KEY
      ?.replace(/\\n/g, '\n');

  if (!projectId) {
  throw new Error(
    'Missing FIREBASE_ADMIN_PROJECT_ID'
  );
}

if (!clientEmail) {
  throw new Error(
    'Missing FIREBASE_ADMIN_CLIENT_EMAIL'
  );
}

if (!privateKey) {
  throw new Error(
    'Missing FIREBASE_ADMIN_PRIVATE_KEY'
  );
}

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

const adminApp = getAdminApp();

// IMPORTANT:
// BizCentral uses named Firestore database
// "biz-central"

export const adminDb =
  getFirestore(adminApp, 'biz-central');

export const adminAuth =
  getAuth(adminApp);