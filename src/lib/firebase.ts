// src/lib/firebase.ts
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCmmWuGUjNMBnyeURv0U71G4iR1DUQrjeU",
  authDomain: "swaziland-store-data.firebaseapp.com",
  projectId: "swaziland-store-data",
  storageBucket: "swaziland-store-data.appspot.com",
  messagingSenderId: "24639901223",
  appId: "1:24639901223:web:7de60ce39674a40d014802",
  measurementId: "G-8J6HW6S3S2"
};
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const db = getFirestore(app, "biz-central");