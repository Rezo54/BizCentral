"use client";

import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { getCurrentUser } from "@/lib/session";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [processingUserId, setProcessingUserId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<string>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const superadmin = currentUser?.accessLevel === "superadmin";

  async function apiRequest(method: "GET" | "PATCH", body?: unknown) {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) throw new Error("Your authenticated session is not available.");
    const token = await firebaseUser.getIdToken();
    const response = await fetch("/api/admin/users", {
      method,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || `User administration failed (${response.status}).`);
    return data;
  }

  async function loadUsers() {
    try {
      setLoading(true);
      const data = await apiRequest("GET");
      setUsers(Array.isArray(data?.users) ? data.users : []);
    } catch (err) {
      console.error("Load users failed:", err);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    async function init() {
      const u = await getCurrentUser();
      if (!mounted) return;
      if (!u) { setLoading(false); return; }
      setCurrentUser(u);
      if (u.accessLevel === "superadmin") await loadUsers();
      else setLoading(false);
    }
    init();
    return () => { mounted = false; };
  }, []);

  function handleSort(field: string) {
    if (sortField === field) setSortDirection((prev) => prev === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDirection("asc"); }
  }

  async function decideUser(user: any, decision: "approve" | "reject" | "remove") {
    if (!superadmin) { alert("Only superadmin can administer users"); return; }
    if (!user?.uid) { alert("This user does not have a Firebase Authentication UID."); return; }

    if (decision === "approve" && !user?.role) {
      alert("Please assign a role before approving the user.");
      return;
    }
    if (decision === "reject" && !window.confirm(`Reject access for ${user.name || "this user"}?`)) return;
    if (decision === "remove" && !window.confirm(`Remove ${user.name || "this user"} from BizCentral?`)) return;

    try {
      setProcessingUserId(user.id);
      await apiRequest("PATCH", {
        userId: user.id,
        decision,
        ...(decision === "approve" ? { role: user.role } : {}),
      });

      const verb = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "removed";
      alert(`${user.name || "User"} ${verb} successfully.`);
      await loadUsers();
    } catch (err: any) {
      console.error(`${decision} user failed:`, err);
      alert(err?.message || `Unable to ${decision} user.`);
    } finally {
      setProcessingUserId(null);
    }
  }

  if (loading || currentUser === null) return <div className="p-6">Loading...</div>;
  if (!superadmin) return <div className="p-6">No access</div>;

  const sortedUsers = [...users].sort((a, b) => {
    const aPending = a.status === "pending";
    const bPending = b.status === "pending";
    if (aPending && !bPending) return -1;
    if (!aPending && bPending) return 1;
    const aVal = (a[sortField] || "").toString().toLowerCase();
    const bVal = (b[sortField] || "").toString().toLowerCase();
    if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  const sortMark = (field: string) => sortField === field ? (sortDirection === "asc" ? "▲" : "▼") : "";

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">User Approvals</h1>
        <p className="mt-1 text-sm text-gray-500">User lifecycle decisions are authorized and written by the BizCentral server. The browser no longer writes userAccess directly.</p>
      </div>

      <div className="border rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th onClick={() => handleSort("name")} className="p-3 text-left cursor-pointer">Name {sortMark("name")}</th>
              <th onClick={() => handleSort("email")} className="p-3 text-left cursor-pointer">Email {sortMark("email")}</th>
              <th onClick={() => handleSort("userType")} className="p-3 text-left cursor-pointer">Type {sortMark("userType")}</th>
              <th onClick={() => handleSort("businessName")} className="p-3 text-left cursor-pointer">Company {sortMark("businessName")}</th>
              <th onClick={() => handleSort("status")} className="p-3 text-left cursor-pointer">Status {sortMark("status")}</th>
              <th onClick={() => handleSort("role")} className="p-3 text-left cursor-pointer">Role {sortMark("role")}</th>
              <th className="p-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedUsers.map((u) => {
              const processing = processingUserId === u.id;
              const protectedSuperadmin = u.role === "superadmin" || u.accessLevel === "superadmin";
              return (
                <tr key={u.id} className="border-t hover:bg-gray-50">
                  <td className="p-3">{u.name}</td>
                  <td className="p-3">{u.email}</td>
                  <td className="p-3 capitalize">{u.userType}</td>
                  <td className="p-3 capitalize">{u.userType === "reliever" ? u.relieverId?.replace(/-\d+$/, "") : u.businessName}</td>
                  <td className="p-3 capitalize">
                    <span className={`px-2 py-1 rounded text-xs ${u.status === "approved" ? "bg-green-100 text-green-700" : u.status === "rejected" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                      {u.status || "pending"}
                    </span>
                  </td>
                  <td className="p-3"><span className="px-2 py-1 rounded bg-gray-200 text-xs capitalize">{u.role || "pending"}</span></td>
                  <td className="p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {u.status === "pending" && <>
                        <select
                          disabled={processing}
                          value={u.role || ""}
                          onChange={(e) => {
                            const newRole = e.target.value;
                            setUsers((prev) => prev.map((user) => user.id === u.id ? { ...user, role: newRole } : user));
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
                        <button disabled={!u.role || processing} onClick={() => decideUser(u, "approve")} className={`px-2 py-1 rounded text-white ${u.role && !processing ? "bg-green-600 hover:bg-green-700" : "bg-gray-400 cursor-not-allowed"}`}>{processing ? "Working..." : "Approve"}</button>
                        <button disabled={processing} onClick={() => decideUser(u, "reject")} className={`px-2 py-1 rounded text-white ${!processing ? "bg-red-600 hover:bg-red-700" : "bg-gray-400 cursor-not-allowed"}`}>Reject</button>
                      </>}

                      {!protectedSuperadmin && <button disabled={processing} onClick={() => decideUser(u, "remove")} className={`px-2 py-1 rounded text-white ${!processing ? "bg-gray-700 hover:bg-gray-800" : "bg-gray-400 cursor-not-allowed"}`}>Remove</button>}
                      {u.status === "approved" && <span className="text-green-600">Approved</span>}
                      {u.status === "rejected" && <span className="text-red-600">Rejected</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
