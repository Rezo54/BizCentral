//src/app/(app)/admin/users/page.tsx

"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";

import { getCurrentUser } from "@/lib/session";

function mapUserType(role: string) {
  if (role === "client_employee" || role === "supplier") {
    return "reliever";
  }

  if (role === "client") {
    return "edo";
  }

  if (role === "admin_user" || role === "supervisor") {
    return "taskraft";
  }

  return "unknown";
}


export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // 🔥 DEFINE ROLES HERE
  const admin =
  currentUser?.accessLevel === "admin" ||
  currentUser?.role === "admin_user";

  const superadmin =
  currentUser?.accessLevel === "superadmin" ||
  currentUser?.role === "super_admin";

  // =============================
  // LOAD USERS
  // =============================
  async function loadUsers() {
    const snap = await getDocs(collection(db, "users"));
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setUsers(data);
    setLoading(false);
  }

  useEffect(() => {
  let mounted = true;

  async function init() {
    const u = await getCurrentUser();

    console.log("CURRENT USER:", u);

    if (!mounted) return;

    if (!u) {
      setLoading(false); // stop loading spinner
      return;
    }

    setCurrentUser(u);

    await loadUsers();
  }

  init();

  return () => {
    mounted = false;
  };
}, []);

  // =============================
  // APPROVE USER
  // =============================
  async function approveUser(id: string, role: string) {
   if (!superadmin) {
  alert("Only superadmin can approve users");
  return;
  }

  const userType = mapUserType(role); // 🔥 ADD THIS

  await updateDoc(doc(db, "users", id), {
    status: "approved",
    role,
    userType, // 🔥 ADD THIS
  });

  loadUsers();
  }

 

  // =============================
  // REJECT USER
  // =============================
  async function rejectUser(id: string) {
  if (!superadmin) {
    alert("Only superadmin can reject users");
    return;
  }

  await updateDoc(doc(db, "users", id), {
    status: "rejected",
  });

  loadUsers();
  }

  // =============================
  // DELETE USER (PROTECTED)
  // =============================
  async function deleteUser(id: string, role: string) {
    if (!superadmin) {
      alert("Only superadmin can delete users");
      return;
    }

    const confirmDelete = confirm(
      "Are you sure you want to remove this user?"
    );
    if (!confirmDelete) return;

    await deleteDoc(doc(db, "users", id));

    loadUsers();
  }

  if (loading || currentUser === null) {
  return <div className="p-6">Loading...</div>;
  }

  // 🔒 BLOCK NON-ADMIN USERS
  if (!admin && !superadmin) {
    return <div className="p-6">No access</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">User Approvals</h1>

      <div className="border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-3 text-left">Name</th>
              <th className="p-3 text-left">Email</th>
              <th className="p-3 text-left">Type</th>
              <th className="p-3 text-left">Company</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Role</th>
              <th className="p-3 text-left">Actions</th>
            </tr>
          </thead>

          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t hover:bg-gray-50">
                <td className="p-3">{u.name}</td>
                  <td className="p-3">{u.email}</td>
                  <td className="p-3 capitalize">{u.userType}</td>
                  <td className="p-3 capitalize">{u.userType === "reliever"? u.relieverId?.replace(/-\d+$/, ""): u.businessName}</td>
                  <td className="p-3 capitalize">{u.status}</td>

                  <td className="p-3">
                <span className="px-2 py-1 rounded bg-gray-200 text-xs capitalize">
                  {u.role || "pending"}
                </span>
                </td>

<td className="p-3 space-x-2">
                  {/* =======================
                      PENDING USERS ACTIONS
                  ======================= */}
                  {u.status === "pending" && (
                    <>
                      {/* ROLE SELECTOR */}
                      <select
                        disabled={!superadmin}
                        onChange={(e) => {
                          e.stopPropagation();
                          if (!superadmin) return; // 🔒 LOCK
                          approveUser(u.id, e.target.value);
                        }}
                        className="border px-2 py-1 rounded"
                        defaultValue=""
                      >
                       <option value="">Assign Role</option>
                       <option value="client_employee">Reliever</option>
                       <option value="client">EDO</option>
                       <option value="admin_user">Admin</option>
                       <option value="supervisor">Supervisor</option>
                       <option value="supplier">Supplier</option>
                      </select>

                      {/* REJECT */}
                      <button
                        disabled={!superadmin}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!superadmin) return; // 🔒 LOCK
                          rejectUser(u.id);
                        }}
                        className={`px-2 py-1 rounded text-white ${
                          superadmin ? "bg-red-600" : "bg-gray-400 cursor-not-allowed"
                        }`}
                      >
                        Reject
                      </button>
                    </>
                  )}

                  {/* =======================
                      REMOVE USER
                  ======================= */}
                  {u.role !== "super_admin" && (
                    <button
                      disabled={!superadmin}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!superadmin) return; // 🔒 LOCK
                        deleteUser(u.id, u.role);
                      }}
                      className={`px-2 py-1 rounded text-white ${
                        superadmin ? "bg-gray-700" : "bg-gray-400 cursor-not-allowed"
                      }`}
                    >
                      Remove
                    </button>
                  )}

                  {/* =======================
                      STATUS DISPLAY
                  ======================= */}
                  {u.status === "approved" && (
                    <span className="text-green-600">Approved</span>
                  )}

                  {u.status === "rejected" && (
                    <span className="text-red-600">Rejected</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}