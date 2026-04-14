import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

// =============================
// GET ALL EDOS (FROM COMPANIES)
// =============================
function formatEdoName(edoId: string) {
  let name = edoId
    .replace("edo-", "")
    .replace(/-/g, " ")
    .replace(/\benterprise\b/gi, "")   // remove "Enterprise"
    .replace(/\bpty ltd\b/gi, "")     // remove existing "PTY LTD"
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (l) => l.toUpperCase());

  return `${name} (PTY) LTD`;
}

export async function listEdos() {
  const routesSnap = await getDocs(collection(db, "routes"));
  const usersSnap = await getDocs(collection(db, "users"));

  const edoMap = new Map<string, string>();

  // ✅ 1. USE USERS BUT NORMALIZE FORMAT
  usersSnap.docs.forEach((doc) => {
    const u = doc.data();
    if (u.userType === "edo" && u.companyId) {
      edoMap.set(u.companyId, formatEdoName(u.companyId));
    }
  });

  // ✅ 2. FILL FROM ROUTES
  routesSnap.docs.forEach((doc) => {
    const r = doc.data();

    if (r.edoId && !edoMap.has(r.edoId)) {
      edoMap.set(r.edoId, formatEdoName(r.edoId));
    }
  });

  return Array.from(edoMap.entries()).map(([id, name]) => ({
    id,
    name,
  }));
}

// =============================
// GET ROUTES FOR EDO
// =============================
export async function listRoutesForEdo(edoId: string) {
  const q = query(
    collection(db, "routes"),
    where("edoId", "==", edoId)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => {
    const data = doc.data() as any;

    return {
    id: doc.id,
    code: data.routeNo,          // 🔥 FIX HERE
    description: data.description || "",
    edoId: data.edoId,
  };
});
}