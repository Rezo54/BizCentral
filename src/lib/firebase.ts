// src/lib/firebase.ts
import { initializeApp, getApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// const firebaseConfig = {
//   apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
//   authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
//   projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
//   storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
//   messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
//   appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
// };


const firebaseConfig = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,

  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,

  projectId:
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,

  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,

  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,

  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};
// const firebaseConfig = {
//   apiKey: "AIzaSyCmmWuGUjNMBnyeURv0U71G4iR1DUQrjeU",
//   authDomain: "swaziland-store-data.firebaseapp.com",
//   databaseURL: "https://swaziland-store-data-default-rtdb.europe-west1.firebasedatabase.app",
//   projectId: "swaziland-store-data",
//   storageBucket: "swaziland-store-data.firebasestorage.app",
//   messagingSenderId: "24639901223",
//   appId: "1:24639901223:web:7de60ce39674a40d014802",
//   measurementId: "G-8J6HW6S3S2"
// };

console.log('FIREBASE CLIENT CONFIG:', {
  apiKeyLoaded:
    !!firebaseConfig.apiKey,

  apiKeyStart:
    firebaseConfig.apiKey?.substring(0, 6),

  authDomain:
    firebaseConfig.authDomain,

  projectId:
    firebaseConfig.projectId,

  appIdLoaded:
    !!firebaseConfig.appId,

  messagingSenderId:
    firebaseConfig.messagingSenderId,
});

// Init Firebase safely
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app, "biz-central");