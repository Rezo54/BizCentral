// src/lib/firebase-admin.ts

import {
  getApps,
  initializeApp,
  cert,
  App,
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

function getAdminApp(): App {

  // ---------------------------------------------------
  // Reuse existing Admin app
  // ---------------------------------------------------

  const existingApps = getApps();

  if (existingApps.length > 0) {
    return existingApps[0];
  }

  // ---------------------------------------------------
  // ENVIRONMENT VARIABLES
  // ---------------------------------------------------

  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID;

  const clientEmail =
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL;

  const rawPrivateKey =
    process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  // ---------------------------------------------------
  // VALIDATE ENVIRONMENT
  // ---------------------------------------------------

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

  if (!rawPrivateKey) {
    throw new Error(
      'Missing FIREBASE_ADMIN_PRIVATE_KEY'
    );
  }

  // ---------------------------------------------------
  // NORMALISE PRIVATE KEY
  //
  // Supports:
  // .env.local:
  // -----BEGIN PRIVATE KEY-----\n...\n...
  //
  // and Netlify multiline environment variables.
  // ---------------------------------------------------

  const privateKey =
    rawPrivateKey
      .replace(/^["']|["']$/g, '')
      .replace(/\\n/g, '\n')
      .trim();

  // ---------------------------------------------------
  // BASIC PRIVATE KEY VALIDATION
  //
  // Never log the key itself.
  // ---------------------------------------------------

  if (
    !privateKey.includes(
      '-----BEGIN PRIVATE KEY-----'
    ) ||
    !privateKey.includes(
      '-----END PRIVATE KEY-----'
    )
  ) {
    throw new Error(
      'FIREBASE_ADMIN_PRIVATE_KEY has invalid PEM formatting'
    );
  }

  // ---------------------------------------------------
  // INITIALISE FIREBASE ADMIN
  // ---------------------------------------------------

  try {

    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });

  } catch (error) {

    console.error(
      'Firebase Admin initialisation failed.',
      error
    );

    throw error;
  }
}

// =====================================================
// ADMIN APP
// =====================================================

const adminApp =
  getAdminApp();

// =====================================================
// FIRESTORE
//
// BizCentral uses the named Firestore database:
//
// biz-central
// =====================================================

export const adminDb =
  getFirestore(
    adminApp,
    'biz-central'
  );

// =====================================================
// FIREBASE AUTH
// =====================================================

export const adminAuth =
  getAuth(adminApp);