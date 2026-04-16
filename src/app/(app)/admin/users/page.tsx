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
  currentUser?.role === "superadmin";

  const [sortField, setSortField] = useState<string>("name"); // 🔥 DEFAULT SORT FIELD, added 16/04/2026
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // =============================
  // LOAD USERS
  // =============================
  async function loadUsers() {
  try {
    const snap = await getDocs(collection(db, "users"));
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setUsers(data);
  } catch (err) {
    console.error("Load users failed:", err);
  } finally {
    setLoading(false);
  }
  }

  useEffect(() => {
  let mounted = true;

  async function init() {
    const u = await getCurrentUser();
    
    //console.log("CURRENT USER:", u);

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
  // SORT USERS (CLIENT-SIDE)
  function handleSort(field: string) {
  if (sortField === field) {
    setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
  } else {
    setSortField(field);
    setSortDirection("asc");
    }
  }

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

  const sortedUsers = [...users].sort((a, b) => {
  const aVal = (a[sortField] || "").toString().toLowerCase();
  const bVal = (b[sortField] || "").toString().toLowerCase();

  if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
  if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
  return 0;
  });

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">User Approvals</h1>

      <div className="border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th onClick={() => handleSort("name")} className="p-3 text-left cursor-pointer">
                Name {sortField === "name" ? (sortDirection === "asc" ? "▲" : "▼") : ""}
              </th>
              <th onClick={() => handleSort("email")} className="p-3 text-left cursor-pointer">
                Email {sortField === "email" ? (sortDirection === "asc" ? "▲" : "▼") : ""}
              </th>
              <th onClick={() => handleSort("userType")} className="p-3 text-left cursor-pointer">
                Type {sortField === "userType" ? (sortDirection === "asc" ? "▲" : "▼") : ""}
              </th>
              <th onClick={() => handleSort("businessName")} className="p-3 text-left cursor-pointer">
                Company {sortField === "businessName" ? (sortDirection === "asc" ? "▲" : "▼") : ""}
              </th>
              <th onClick={() => handleSort("status")} className="p-3 text-left cursor-pointer">
                Status {sortField === "status" ? (sortDirection === "asc" ? "▲" : "▼") : ""}
              </th>
              <th onClick={() => handleSort("role")} className="p-3 text-left cursor-pointer">
                Role {sortField === "role" ? (sortDirection === "asc" ? "▲" : "▼") : ""}
              </th>
              <th className="p-3 text-left">Actions</th>
            </tr>          
              <th className="p-3 text-left">Role</th>
              <th className="p-3 text-left">Actions</th>
            </tr>
          </thead>

          <tbody>
            {sortedUsers.map((u) => (
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
                    value={u.role || ""}
                    onChange={(e) => {
                      e.stopPropagation();

                      const newRole = e.target.value;

                      // 🔥 IMPORTANT: trigger React re-render properly
                      setUsers((prev) =>
                        prev.map((user) =>
                          user.id === u.id
                            ? { ...user, role: newRole }
                            : user
                        )
                      );
                    }}
                    className="border px-2 py-1 rounded"
                  >
                    <option value="">Assign Role</option>
                    <option value="client_employee">Reliever</option>
                    <option value="client">EDO</option>
                    <option value="admin_user">Admin</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="supplier">Supplier</option>
                  </select>

                  {/* APPROVE */}
                  <button
                    disabled={!superadmin || !u.role}
                    onClick={(e) => {
                      e.stopPropagation();

                      if (!superadmin || !u.role) return;

                      approveUser(u.id, u.role);
                    }}
                    className={`px-2 py-1 rounded text-white ${
                      superadmin && u.role
                        ? "bg-green-600"
                        : "bg-gray-400 cursor-not-allowed"
                    }`}
                  >
                    Approve
                  </button>                    

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
                  {u.role !== "superadmin" && (
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