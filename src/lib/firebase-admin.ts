// src/lib/firebase-admin.ts

import type { App } from 'firebase-admin/app';
import type { Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import type { Storage } from 'firebase-admin/storage';

let cachedAdminApp: App | null = null;
let cachedAdminDb: Firestore | null = null;
let cachedAdminAuth: Auth | null = null;
let cachedAdminStorage: Storage | null = null;

export async function getAdminApp(): Promise<App> {
  if (cachedAdminApp) return cachedAdminApp;

  const { getApps, initializeApp, cert } = await import('firebase-admin/app');
  const APP_NAME = 'bizcentral-admin';
  const existingApp = getApps().find((app) => app.name === APP_NAME);
  if (existingApp) {
    cachedAdminApp = existingApp;
    return cachedAdminApp;
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawPrivateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

  if (!projectId) throw new Error('Missing FIREBASE_ADMIN_PROJECT_ID');
  if (!clientEmail) throw new Error('Missing FIREBASE_ADMIN_CLIENT_EMAIL');
  if (!rawPrivateKey) throw new Error('Missing FIREBASE_ADMIN_PRIVATE_KEY');

  const privateKey = rawPrivateKey.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n').trim();
  if (!privateKey.includes('-----BEGIN PRIVATE KEY-----') || !privateKey.includes('-----END PRIVATE KEY-----')) {
    throw new Error('FIREBASE_ADMIN_PRIVATE_KEY has invalid PEM formatting');
  }

  cachedAdminApp = initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    projectId,
    ...(storageBucket ? { storageBucket } : {}),
  }, APP_NAME);

  return cachedAdminApp;
}

export async function getAdminDb(): Promise<Firestore> {
  if (cachedAdminDb) return cachedAdminDb;
  const adminApp = await getAdminApp();
  const { getFirestore } = await import('firebase-admin/firestore');
  cachedAdminDb = getFirestore(adminApp, 'biz-central');
  return cachedAdminDb;
}

export async function getAdminAuth(): Promise<Auth> {
  if (cachedAdminAuth) return cachedAdminAuth;
  const adminApp = await getAdminApp();
  const { getAuth } = await import('firebase-admin/auth');
  cachedAdminAuth = getAuth(adminApp);
  return cachedAdminAuth;
}

export async function getAdminStorage(): Promise<Storage> {
  if (cachedAdminStorage) return cachedAdminStorage;
  const adminApp = await getAdminApp();
  const { getStorage } = await import('firebase-admin/storage');
  cachedAdminStorage = getStorage(adminApp);
  return cachedAdminStorage;
}
