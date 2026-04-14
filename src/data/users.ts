import {
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export type AppUser = {
  id: string;
  name: string;
  email: string;
  username: string;
  role: string;
  companyId: string;
  status: "pending" | "approved";
};

// CREATE USER PROFILE
export async function createUserProfile(user: AppUser) {
  await setDoc(doc(db, "users", user.id), user);
}

// GET USER PROFILE
export async function getUserProfile(uid: string): Promise<AppUser | null> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return snap.data() as AppUser;
}

// LIST PENDING USERS (admin)
export async function listPendingUsers(): Promise<AppUser[]> {
  const snapshot = await getDocs(collection(db, "users"));
  return snapshot.docs
    .map((doc) => doc.data() as AppUser)
    .filter((u) => u.status === "pending");
}

// APPROVE USER
export async function approveUser(userId: string) {
  await updateDoc(doc(db, "users", userId), {
    status: "approved",
  });
}