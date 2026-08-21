// src/lib/firebase-admin.ts

import {
  getApps,
  initializeApp,
  cert,
  App,
} from 'firebase-admin/app';

import {
  getFirestore,
  Firestore,
} from 'firebase-admin/firestore';

import {
  getAuth,
  Auth,
} from 'firebase-admin/auth';

// =====================================================
// FIREBASE ADMIN
// SERVER SIDE ONLY
//
// IMPORTANT:
//
// Firebase Admin is initialised LAZILY.
//
// This prevents a bad/missing Netlify environment
// variable from crashing an API route while the
// module itself is being imported.
// =====================================================

let cachedAdminApp: App | null = null;

let cachedAdminDb: Firestore | null = null;

let cachedAdminAuth: Auth | null = null;


// =====================================================
// GET ADMIN APP
// =====================================================

export function getAdminApp(): App {

  // ---------------------------------------------------
  // Return cached app
  // ---------------------------------------------------

  if (cachedAdminApp) {
    return cachedAdminApp;
  }

  // ---------------------------------------------------
  // Reuse Firebase Admin app if already initialised
  // ---------------------------------------------------

  const existingApps =
    getApps();

  if (existingApps.length > 0) {

    cachedAdminApp =
      existingApps[0];

    return cachedAdminApp;
  }

  // ---------------------------------------------------
  // ENVIRONMENT VARIABLES
  // ---------------------------------------------------

  const projectId =
    process.env
      .FIREBASE_ADMIN_PROJECT_ID;

  const clientEmail =
    process.env
      .FIREBASE_ADMIN_CLIENT_EMAIL;

  const rawPrivateKey =
    process.env
      .FIREBASE_ADMIN_PRIVATE_KEY;

  // ---------------------------------------------------
  // VALIDATION
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
  // Supports both:
  //
  // \n escaped keys
  //
  // and
  //
  // real multiline Netlify keys.
  // ---------------------------------------------------

  const privateKey =
    rawPrivateKey
      .replace(/^["']|["']$/g, '')
      .replace(/\\n/g, '\n')
      .trim();

  // ---------------------------------------------------
  // BASIC PEM VALIDATION
  //
  // Never print/log the actual private key.
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
  // INITIALISE
  // ---------------------------------------------------

  cachedAdminApp =
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });

  return cachedAdminApp;
}


// =====================================================
// GET ADMIN FIRESTORE
// =====================================================

export function getAdminDb(): Firestore {

  if (cachedAdminDb) {
    return cachedAdminDb;
  }

  const app =
    getAdminApp();

  // BizCentral uses named Firestore DB:
  //
  // biz-central

  cachedAdminDb =
    getFirestore(
      app,
      'biz-central'
    );

  return cachedAdminDb;
}


// =====================================================
// GET ADMIN AUTH
// =====================================================

export function getAdminAuth(): Auth {

  if (cachedAdminAuth) {
    return cachedAdminAuth;
  }

  const app =
    getAdminApp();

  cachedAdminAuth =
    getAuth(app);

  return cachedAdminAuth;
}