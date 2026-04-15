import { getAuth, onAuthStateChanged } from "firebase/auth";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";

// =============================
// TYPES
// =============================
export type AccessLevel = "standard" | "power_user" | "admin" | "superadmin";

export type UserType = "reliever" | "edo" | "taskraft";

export type SessionUser = {
  uid: string;
  name: string;
  email: string;

  userType: UserType; // 🔥 ADD THIS

  accessLevel: AccessLevel;

  edoId?: string;
  companyId?: string;
  relieverId?: string;
};

// =============================
// GET CURRENT USER (REAL)
// =============================
export async function getCurrentUser(): Promise<SessionUser | null> {
  const auth = getAuth();

  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      unsubscribe();

      if (!firebaseUser) {
        resolve(null);
        return;
      }

      const q = query(
        collection(db, "users"),
        where("uid", "==", firebaseUser.uid)
      );

      const snap = await getDocs(q);

      if (snap.empty) {
        resolve(null);
        return;
      }

  

      const data = snap.docs[0].data();

        resolve({
          uid: data.uid,
          name: data.name,
          email: data.email,

          userType: data.userType,       // 🔥 REQUIRED
          accessLevel: data.accessLevel, // 🔥 REQUIRED

          companyId: data.companyId,
          relieverId: data.relieverId,
        });
    });
  });
}

// =============================
// ACCESS CONTROL
// =============================
const ACCESS_RANK: Record<AccessLevel, number> = {
  standard: 1,
  power_user: 2,
  admin: 3,
  superadmin: 4,
};

export function hasAccess(user: SessionUser, minLevel: AccessLevel) {
  return ACCESS_RANK[user.accessLevel] >= ACCESS_RANK[minLevel];
}