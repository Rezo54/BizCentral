// src/app/(app)/admin/users/page.tsx

"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

import { getCurrentUser } from "@/lib/session";

/* =========================================================
   ROLE / ACCESS MAPPING
========================================================= */

function mapUserType(role: string) {
  if (
    role === "client_employee" ||
    role === "supplier"
  ) {
    return "reliever";
  }

  if (role === "client") {
    return "edo";
  }

  if (
    role === "admin_user" ||
    role === "supervisor"
  ) {
    return "taskraft";
  }

  return "unknown";
}

function mapAccessLevel(role: string) {
  if (role === "client") {
    return "power_user";
  }

  if (role === "admin_user") {
    return "admin";
  }

  if (role === "supervisor") {
    return "standard";
  }

  if (
    role === "client_employee" ||
    role === "supplier"
  ) {
    return "standard";
  }

  return "standard";
}

/* =========================================================
   PAGE
========================================================= */

export default function AdminUsersPage() {
  const [users, setUsers] =
    useState<any[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [
    currentUser,
    setCurrentUser,
  ] = useState<any>(null);

  const [
    processingUserId,
    setProcessingUserId,
  ] = useState<string | null>(null);

  const [sortField, setSortField] =
    useState<string>("name");

  const [
    sortDirection,
    setSortDirection,
  ] =
    useState<"asc" | "desc">(
      "asc"
    );

  /* =======================================================
     CURRENT USER PERMISSIONS
  ======================================================= */

  const admin =
    currentUser?.accessLevel ===
      "admin" ||
    currentUser?.role ===
      "admin_user";

  const superadmin =
    currentUser?.accessLevel ===
      "superadmin";

  /* =======================================================
     LOAD USERS
  ======================================================= */

  async function loadUsers() {
    try {
      setLoading(true);

      const snap =
        await getDocs(
          collection(
            db,
            "users"
          )
        );

      const data =
        snap.docs.map(
          (d) => ({
            id: d.id,
            ...d.data(),
          })
        );

      setUsers(data);

    } catch (err) {
      console.error(
        "Load users failed:",
        err
      );

    } finally {
      setLoading(false);
    }
  }

  /* =======================================================
     INITIALISE
  ======================================================= */

  useEffect(() => {
    let mounted = true;

    async function init() {
      const u =
        await getCurrentUser();

      if (!mounted) {
        return;
      }

      if (!u) {
        setLoading(false);
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

  /* =======================================================
     SORT USERS
  ======================================================= */

  function handleSort(
    field: string
  ) {
    if (
      sortField === field
    ) {
      setSortDirection(
        (prev) =>
          prev === "asc"
            ? "desc"
            : "asc"
      );

    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  }

  /* =======================================================
     APPROVE USER

     IMPORTANT:
     /users and /userAccess are updated in ONE batch.

     This prevents the profile and authorization records
     from getting out of sync.
  ======================================================= */

  async function approveUser(
    user: any
  ) {
    if (!superadmin) {
      alert(
        "Only superadmin can approve users"
      );

      return;
    }

    if (!user?.uid) {
      alert(
        "This user does not have a Firebase Authentication UID."
      );

      return;
    }

    if (!user?.role) {
      alert(
        "Please assign a role before approving the user."
      );

      return;
    }

    const userType =
      mapUserType(
        user.role
      );

    const accessLevel =
      mapAccessLevel(
        user.role
      );

    if (
      userType === "unknown"
    ) {
      alert(
        "Unable to determine the user type from the selected role."
      );

      return;
    }

    try {
      setProcessingUserId(
        user.id
      );

      const batch =
        writeBatch(db);

      const userRef =
        doc(
          db,
          "users",
          user.id
        );

      const accessRef =
        doc(
          db,
          "userAccess",
          user.uid
        );

      /* ---------------------------------------------------
         UPDATE PROFILE
      --------------------------------------------------- */

      batch.update(
        userRef,
        {
          status:
            "approved",

          role:
            user.role,

          userType,

          accessLevel,
        }
      );

      /* ---------------------------------------------------
         UPDATE / CREATE AUTHORIZATION

         set + merge means this also repairs a missing
         userAccess record for an older user.
      --------------------------------------------------- */

      const accessData: any = {
        uid:
          user.uid,

        name:
          String(
            user.name || ""
          ).trim(),

        email:
          String(
            user.email || ""
          )
            .trim()
            .toLowerCase(),

        userType,

        accessLevel,

        status:
          "approved",

        syncedFromUserDoc:
          user.id,

        updatedAt:
          serverTimestamp(),
      };

      /*
        EDO access is tied to companyId.
      */

      if (
        userType === "edo"
      ) {
        accessData.companyId =
          user.companyId || null;

      } else {
        accessData.companyId =
          null;
      }

      /*
        Reliever access retains its relieverId.
      */

      if (
        userType ===
        "reliever"
      ) {
        accessData.relieverId =
          user.relieverId ||
          null;
      }

      batch.set(
        accessRef,
        accessData,
        {
          merge: true,
        }
      );

      await batch.commit();

      alert(
        `${user.name || "User"} approved successfully. User access has been updated.`
      );

      await loadUsers();

    } catch (err: any) {
      console.error(
        "Approve user failed:",
        err
      );

      alert(
        err?.message ||
          "Unable to approve user."
      );

    } finally {
      setProcessingUserId(
        null
      );
    }
  }

  /* =======================================================
     REJECT USER

     /users and /userAccess are updated together.
  ======================================================= */

  async function rejectUser(
    user: any
  ) {
    if (!superadmin) {
      alert(
        "Only superadmin can reject users"
      );

      return;
    }

    if (!user?.uid) {
      alert(
        "This user does not have a Firebase Authentication UID."
      );

      return;
    }

    const confirmed =
      window.confirm(
        `Reject access for ${user.name || "this user"}?`
      );

    if (!confirmed) {
      return;
    }

    try {
      setProcessingUserId(
        user.id
      );

      const batch =
        writeBatch(db);

      const userRef =
        doc(
          db,
          "users",
          user.id
        );

      const accessRef =
        doc(
          db,
          "userAccess",
          user.uid
        );

      batch.update(
        userRef,
        {
          status:
            "rejected",
        }
      );

      /*
        We do not delete userAccess.

        Keeping the record gives us an audit trail and
        prevents a rejected user from being treated as
        though no access decision exists.
      */

      batch.set(
        accessRef,
        {
          uid:
            user.uid,

          name:
            String(
              user.name || ""
            ).trim(),

          email:
            String(
              user.email || ""
            )
              .trim()
              .toLowerCase(),

          userType:
            user.userType ||
            mapUserType(
              user.role || ""
            ),

          accessLevel:
            "pending",

          status:
            "rejected",

          companyId:
            user.companyId ||
            null,

          syncedFromUserDoc:
            user.id,

          updatedAt:
            serverTimestamp(),
        },
        {
          merge: true,
        }
      );

      await batch.commit();

      alert(
        `${user.name || "User"} rejected. User access has been disabled.`
      );

      await loadUsers();

    } catch (err: any) {
      console.error(
        "Reject user failed:",
        err
      );

      alert(
        err?.message ||
          "Unable to reject user."
      );

    } finally {
      setProcessingUserId(
        null
      );
    }
  }

  /* =======================================================
     REMOVE USER

     NOTE:
     Firebase Authentication accounts cannot be deleted
     securely from this client page.

     This removes the /users profile and marks userAccess
     as removed so the Auth account has no BizCentral access.
  ======================================================= */

  async function deleteUser(
    user: any
  ) {
    if (!superadmin) {
      alert(
        "Only superadmin can remove users"
      );

      return;
    }

    if (
      user.role ===
        "superadmin" ||
      user.accessLevel ===
        "superadmin"
    ) {
      alert(
        "The superadmin account cannot be removed here."
      );

      return;
    }

    const confirmDelete =
      window.confirm(
        `Remove ${user.name || "this user"} from BizCentral?`
      );

    if (!confirmDelete) {
      return;
    }

    try {
      setProcessingUserId(
        user.id
      );

      /*
        Disable authorization first.

        We deliberately retain userAccess for audit
        purposes instead of deleting it.
      */

      if (user.uid) {
        const batch =
          writeBatch(db);

        batch.set(
          doc(
            db,
            "userAccess",
            user.uid
          ),
          {
            uid:
              user.uid,

            name:
              String(
                user.name || ""
              ).trim(),

            email:
              String(
                user.email || ""
              )
                .trim()
                .toLowerCase(),

            status:
              "removed",

            updatedAt:
              serverTimestamp(),
          },
          {
            merge: true,
          }
        );

        batch.delete(
          doc(
            db,
            "users",
            user.id
          )
        );

        await batch.commit();

      } else {
        /*
          Legacy profile with no Auth UID.
        */

        await deleteDoc(
          doc(
            db,
            "users",
            user.id
          )
        );
      }

      alert(
        `${user.name || "User"} removed from BizCentral access.`
      );

      await loadUsers();

    } catch (err: any) {
      console.error(
        "Remove user failed:",
        err
      );

      alert(
        err?.message ||
          "Unable to remove user."
      );

    } finally {
      setProcessingUserId(
        null
      );
    }
  }

  /* =======================================================
     LOADING / ACCESS
  ======================================================= */

  if (
    loading ||
    currentUser === null
  ) {
    return (
      <div className="p-6">
        Loading...
      </div>
    );
  }

  if (
    !admin &&
    !superadmin
  ) {
    return (
      <div className="p-6">
        No access
      </div>
    );
  }

/* =======================================================
     SORTED USERS

     Pending approvals always appear first.

     Within each status group, users follow the currently
     selected table sorting (Name, Email, Type, Company,
     Status or Role).

     Once a pending user is approved or rejected, they
     automatically return to the normal sorted list.
  ======================================================= */

  const sortedUsers =
    [...users].sort(
      (a, b) => {

        /* -------------------------------------------------
           1. PENDING USERS ALWAYS FIRST
        ------------------------------------------------- */

        const aPending =
          a.status === "pending";

        const bPending =
          b.status === "pending";

        if (
          aPending &&
          !bPending
        ) {
          return -1;
        }

        if (
          !aPending &&
          bPending
        ) {
          return 1;
        }

        /* -------------------------------------------------
           2. NORMAL USER-SELECTED SORTING
        ------------------------------------------------- */

        const aVal =
          (
            a[sortField] ||
            ""
          )
            .toString()
            .toLowerCase();

        const bVal =
          (
            b[sortField] ||
            ""
          )
            .toString()
            .toLowerCase();

        if (
          aVal < bVal
        ) {
          return sortDirection ===
            "asc"
            ? -1
            : 1;
        }

        if (
          aVal > bVal
        ) {
          return sortDirection ===
            "asc"
            ? 1
            : -1;
        }

        return 0;
      }
    );

  /* =======================================================
     PAGE
  ======================================================= */

  return (
    <div className="p-6 space-y-4">

      {/* ===================================================
          HEADER
      =================================================== */}

      <div>

        <h1 className="text-xl font-semibold">
          User Approvals
        </h1>

        <p className="mt-1 text-sm text-gray-500">
          Approvals automatically update both the user profile and BizCentral authorization record.
        </p>

      </div>

      {/* ===================================================
          TABLE
      =================================================== */}

      <div className="border rounded overflow-x-auto">

        <table className="w-full text-sm">

          <thead className="bg-gray-100">

            <tr>

              <th
                onClick={() =>
                  handleSort(
                    "name"
                  )
                }
                className="p-3 text-left cursor-pointer"
              >
                Name{" "}
                {sortField ===
                "name"
                  ? sortDirection ===
                    "asc"
                    ? "▲"
                    : "▼"
                  : ""}
              </th>

              <th
                onClick={() =>
                  handleSort(
                    "email"
                  )
                }
                className="p-3 text-left cursor-pointer"
              >
                Email{" "}
                {sortField ===
                "email"
                  ? sortDirection ===
                    "asc"
                    ? "▲"
                    : "▼"
                  : ""}
              </th>

              <th
                onClick={() =>
                  handleSort(
                    "userType"
                  )
                }
                className="p-3 text-left cursor-pointer"
              >
                Type{" "}
                {sortField ===
                "userType"
                  ? sortDirection ===
                    "asc"
                    ? "▲"
                    : "▼"
                  : ""}
              </th>

              <th
                onClick={() =>
                  handleSort(
                    "businessName"
                  )
                }
                className="p-3 text-left cursor-pointer"
              >
                Company{" "}
                {sortField ===
                "businessName"
                  ? sortDirection ===
                    "asc"
                    ? "▲"
                    : "▼"
                  : ""}
              </th>

              <th
                onClick={() =>
                  handleSort(
                    "status"
                  )
                }
                className="p-3 text-left cursor-pointer"
              >
                Status{" "}
                {sortField ===
                "status"
                  ? sortDirection ===
                    "asc"
                    ? "▲"
                    : "▼"
                  : ""}
              </th>

              <th
                onClick={() =>
                  handleSort(
                    "role"
                  )
                }
                className="p-3 text-left cursor-pointer"
              >
                Role{" "}
                {sortField ===
                "role"
                  ? sortDirection ===
                    "asc"
                    ? "▲"
                    : "▼"
                  : ""}
              </th>

              <th className="p-3 text-left">
                Actions
              </th>

            </tr>

          </thead>

          <tbody>

            {sortedUsers.map(
              (u) => {

                const processing =
                  processingUserId ===
                  u.id;

                return (
                  <tr
                    key={u.id}
                    className="border-t hover:bg-gray-50"
                  >

                    <td className="p-3">
                      {u.name}
                    </td>

                    <td className="p-3">
                      {u.email}
                    </td>

                    <td className="p-3 capitalize">
                      {u.userType}
                    </td>

                    <td className="p-3 capitalize">
                      {u.userType ===
                      "reliever"
                        ? u.relieverId?.replace(
                            /-\d+$/,
                            ""
                          )
                        : u.businessName}
                    </td>

                    <td className="p-3 capitalize">

                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          u.status ===
                          "approved"
                            ? "bg-green-100 text-green-700"
                            : u.status ===
                              "rejected"
                            ? "bg-red-100 text-red-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {u.status ||
                          "pending"}
                      </span>

                    </td>

                    <td className="p-3">

                      <span className="px-2 py-1 rounded bg-gray-200 text-xs capitalize">
                        {u.role ||
                          "pending"}
                      </span>

                    </td>

                    <td className="p-3">

                      <div className="flex flex-wrap items-center gap-2">

                        {/* =================================
                            PENDING USER ACTIONS
                        ================================= */}

                        {u.status ===
                          "pending" && (
                          <>

                            {/* ROLE SELECTOR */}

                            <select
                              disabled={
                                !superadmin ||
                                processing
                              }
                              value={
                                u.role ||
                                ""
                              }
                              onChange={(
                                e
                              ) => {
                                e.stopPropagation();

                                const newRole =
                                  e
                                    .target
                                    .value;

                                setUsers(
                                  (
                                    prev
                                  ) =>
                                    prev.map(
                                      (
                                        user
                                      ) =>
                                        user.id ===
                                        u.id
                                          ? {
                                              ...user,
                                              role: newRole,
                                            }
                                          : user
                                    )
                                );
                              }}
                              className="border px-2 py-1 rounded"
                            >

                              <option value="">
                                Assign Role
                              </option>

                              <option value="client_employee">
                                Reliever
                              </option>

                              <option value="client">
                                EDO
                              </option>

                              <option value="admin_user">
                                Admin
                              </option>

                              <option value="supervisor">
                                Supervisor
                              </option>

                              <option value="supplier">
                                Supplier
                              </option>

                            </select>

                            {/* APPROVE */}

                            <button
                              disabled={
                                !superadmin ||
                                !u.role ||
                                processing
                              }
                              onClick={(
                                e
                              ) => {
                                e.stopPropagation();

                                if (
                                  !superadmin ||
                                  !u.role ||
                                  processing
                                ) {
                                  return;
                                }

                                approveUser(
                                  u
                                );
                              }}
                              className={`px-2 py-1 rounded text-white ${
                                superadmin &&
                                u.role &&
                                !processing
                                  ? "bg-green-600 hover:bg-green-700"
                                  : "bg-gray-400 cursor-not-allowed"
                              }`}
                            >
                              {processing
                                ? "Working..."
                                : "Approve"}
                            </button>

                            {/* REJECT */}

                            <button
                              disabled={
                                !superadmin ||
                                processing
                              }
                              onClick={(
                                e
                              ) => {
                                e.stopPropagation();

                                if (
                                  !superadmin ||
                                  processing
                                ) {
                                  return;
                                }

                                rejectUser(
                                  u
                                );
                              }}
                              className={`px-2 py-1 rounded text-white ${
                                superadmin &&
                                !processing
                                  ? "bg-red-600 hover:bg-red-700"
                                  : "bg-gray-400 cursor-not-allowed"
                              }`}
                            >
                              Reject
                            </button>

                          </>
                        )}

                        {/* =================================
                            REMOVE USER
                        ================================= */}

                        {u.role !==
                          "superadmin" &&
                          u.accessLevel !==
                            "superadmin" && (
                            <button
                              disabled={
                                !superadmin ||
                                processing
                              }
                              onClick={(
                                e
                              ) => {
                                e.stopPropagation();

                                if (
                                  !superadmin ||
                                  processing
                                ) {
                                  return;
                                }

                                deleteUser(
                                  u
                                );
                              }}
                              className={`px-2 py-1 rounded text-white ${
                                superadmin &&
                                !processing
                                  ? "bg-gray-700 hover:bg-gray-800"
                                  : "bg-gray-400 cursor-not-allowed"
                              }`}
                            >
                              Remove
                            </button>
                          )}

                        {/* =================================
                            STATUS DISPLAY
                        ================================= */}

                        {u.status ===
                          "approved" && (
                          <span className="text-green-600">
                            Approved
                          </span>
                        )}

                        {u.status ===
                          "rejected" && (
                          <span className="text-red-600">
                            Rejected
                          </span>
                        )}

                      </div>

                    </td>

                  </tr>
                );
              }
            )}

          </tbody>

        </table>

      </div>

    </div>
  );
}