// src/lib/firebase-admin.ts

import type { App } from 'firebase-admin/app';
import type { Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';

// =====================================================
// FIREBASE ADMIN
// SERVER SIDE ONLY
//
// Firebase Admin packages are dynamically imported.
// This avoids loading firebase-admin while Next/Netlify
// is evaluating the module.
// =====================================================

let cachedAdminApp: App | null = null;
let cachedAdminDb: Firestore | null = null;
let cachedAdminAuth: Auth | null = null;


// =====================================================
// GET ADMIN APP
// =====================================================

export async function getAdminApp(): Promise<App> {

  if (cachedAdminApp) {
    return cachedAdminApp;
  }

  const {
    getApps,
    initializeApp,
    cert,
  } = await import('firebase-admin/app');

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
    process.env.FIREBASE_ADMIN_PROJECT_ID;

  const clientEmail =
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL;

  const rawPrivateKey =
    process.env.FIREBASE_ADMIN_PRIVATE_KEY;

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
  // ---------------------------------------------------

  const privateKey =
    rawPrivateKey
      .replace(/^["']|["']$/g, '')
      .replace(/\\n/g, '\n')
      .trim();

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

export async function getAdminDb(): Promise<Firestore> {

  if (cachedAdminDb) {
    return cachedAdminDb;
  }

  const adminApp =
    await getAdminApp();

  const {
    getFirestore,
  } = await import(
    'firebase-admin/firestore'
  );

  cachedAdminDb =
    getFirestore(
      adminApp,
      'biz-central'
    );

  return cachedAdminDb;
}


// =====================================================
// GET ADMIN AUTH
// =====================================================

export async function getAdminAuth(): Promise<Auth> {

  if (cachedAdminAuth) {
    return cachedAdminAuth;
  }

  const adminApp =
    await getAdminApp();

  const {
    getAuth,
  } = await import(
    'firebase-admin/auth'
  );

  cachedAdminAuth =
    getAuth(adminApp);

  return cachedAdminAuth;
}