/*
  File: src/app/(app)/leave/page.tsx

  Purpose:
  Leave Management for BizCentral HR.

  Access model:
  - Taskraft users can manage leave across all EDO businesses.
  - EDO users are restricted to the companyId assigned in userAccess/{uid}.
  - EDO employee and leave queries are scoped in Firestore with edoId == companyId.
  - Firestore security rules remain the final authorization layer.

  Leave model:
  - 5-day employees: Monday-Friday.
  - 6-day employees: Monday-Saturday.
  - Sunday is excluded from normal leave-day calculations.
*/

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Loader2,
  Plus,
  Search,
  Stethoscope,
  Users,
  XCircle,
} from "lucide-react";

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import { onAuthStateChanged, User } from "firebase/auth";

import { auth, db } from "@/lib/firebase";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { Badge } from "@/components/ui/badge";

/* =========================================================
   TYPES
========================================================= */

type Employee = {
  id: string;
  employeeCode: string;
  firstName: string;
  surname: string;
  edoId: string;
  edoName: string;
  site: string;
  occupation: string;
  workWeek: string;
  appointmentDate: string;
  status: string;
  terminationDate?: string | null;
};

type EdoCompany = {
  id: string;
  name: string;
  site: string;
};

type LeaveRequest = {
  id: string;

  employeeId: string;
  employeeCode: string;
  employeeName: string;

  edoId: string;
  edoName: string;
  site: string;

  leaveType: string;

  fromDate: string;
  toDate: string;

  days: number;

  reason: string;
  workWeek: string;

  status:
    | "pending"
    | "approved"
    | "rejected";

  requestedAt?: unknown;
  approvedAt?: unknown;
  approvedBy?: string | null;
  approvedByName?: string | null;
  rejectedAt?: unknown;
  rejectedBy?: string | null;
  rejectedByName?: string | null;
  rejectionReason?: string | null;
};

type UserAccess = {
  uid: string;
  name: string;
  email: string;
  userType: string;
  accessLevel: string;
  status: string;
  companyId: string | null;
};

/* =========================================================
   HELPERS
========================================================= */

function getToday() {
  const today = new Date();

  const year =
    today.getFullYear();

  const month =
    String(
      today.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      today.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isEdo(
  employee: Employee
) {
  return (
    employee.occupation
      .trim()
      .toLowerCase() === "edo"
  );
}

function isEmployed(
  employee: Employee
) {
  return (
    employee.status
      .trim()
      .toLowerCase() === "employed"
  );
}

function leaveTypeLabel(
  leaveType: string
) {
  const labels:
    Record<string, string> = {
      annual_leave:
        "Annual Leave",

      sick_leave:
        "Sick Leave",

      family_responsibility:
        "Family Responsibility",

      unpaid_leave:
        "Unpaid Leave",
    };

  return (
    labels[leaveType] ||
    leaveType
  );
}

function formatDate(
  dateString: string
) {
  if (!dateString) {
    return "—";
  }

  const [
    year,
    month,
    day,
  ] = dateString.split("-");

  return `${day}/${month}/${year}`;
}

/* =========================================================
   WORKING DAY CALCULATION

   5 Day Worker:
   Monday - Friday

   6 Day Worker:
   Monday - Saturday

   Sunday is always excluded.

   Public holidays will be added later.
========================================================= */

function calculateWorkingDays(
  fromDate: string,
  toDate: string,
  workWeek: string
) {
  if (
    !fromDate ||
    !toDate ||
    !workWeek
  ) {
    return 0;
  }

  const start = new Date(
    `${fromDate}T12:00:00`
  );

  const end = new Date(
    `${toDate}T12:00:00`
  );

  if (start > end) {
    return 0;
  }

  let days = 0;

  const current =
    new Date(start);

  while (current <= end) {
    const day =
      current.getDay();

    /*
      Sunday = 0
      Saturday = 6
    */

    const isWorkingDay =
      workWeek === "6_day"
        ? day !== 0
        : day !== 0 &&
          day !== 6;

    if (isWorkingDay) {
      days++;
    }

    current.setDate(
      current.getDate() + 1
    );
  }

  return days;
}

/* =========================================================
   PAGE
========================================================= */

export default function LeavePage() {
  const router =
    useRouter();

  /* =======================================================
     MASTER DATA
  ======================================================= */

  const [
    companies,
    setCompanies,
  ] =
    useState<EdoCompany[]>([]);

  const [
    employees,
    setEmployees,
  ] =
    useState<Employee[]>([]);

  /*
    Empty for now.

    Next step:
    load leaveRequests from Firestore.
  */

  const [
    leaveRequests,
    setLeaveRequests,
  ] =
    useState<LeaveRequest[]>([]);

  const [
    currentUserAccess,
    setCurrentUserAccess,
  ] =
    useState<UserAccess | null>(null);

  /* =======================================================
     PAGE STATE
  ======================================================= */

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    message,
    setMessage,
  ] =
    useState("");

  const [
    updatingRequestId,
    setUpdatingRequestId,
  ] =
    useState("");

  const [
    showNewRequest,
    setShowNewRequest,
  ] =
    useState(false);

  const [
    savingLeave,
    setSavingLeave,
  ] = useState(false);

  /* =======================================================
     REGISTER FILTERS
  ======================================================= */

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    edoFilter,
    setEdoFilter,
  ] =
    useState("all");

  const [
    typeFilter,
    setTypeFilter,
  ] =
    useState("all");

  const [
    statusFilter,
    setStatusFilter,
  ] =
    useState("all");

  /* =======================================================
     NEW LEAVE REQUEST
  ======================================================= */

  const [
    formEdoId,
    setFormEdoId,
  ] =
    useState("");

  const [
    formEmployeeId,
    setFormEmployeeId,
  ] =
    useState("");

  const [
    formLeaveType,
    setFormLeaveType,
  ] =
    useState("");

  const [
    formFromDate,
    setFormFromDate,
  ] =
    useState("");

  const [
    formToDate,
    setFormToDate,
  ] =
    useState("");

  const [
    formReason,
    setFormReason,
  ] =
    useState("");

  /* =======================================================
     LOAD MASTER DATA
  ======================================================= */

  async function loadData(user: User) {
    try {
      setLoading(true);
      setError("");

      /* ---------------------------------------------------
         CURRENT USER ACCESS
      --------------------------------------------------- */

      const accessSnapshot =
        await getDoc(
          doc(
            db,
            "userAccess",
            user.uid
          )
        );

      if (!accessSnapshot.exists()) {
        setCurrentUserAccess(null);
        setCompanies([]);
        setEmployees([]);
        setLeaveRequests([]);

        throw new Error(
          "No userAccess record exists for the signed-in user."
        );
      }

      const accessData =
        accessSnapshot.data();

      const userAccess: UserAccess = {
        uid: user.uid,
        name: String(accessData.name || ""),
        email: String(accessData.email || ""),
        userType: String(accessData.userType || "").toLowerCase(),
        accessLevel: String(accessData.accessLevel || "").toLowerCase(),
        status: String(accessData.status || "").toLowerCase(),
        companyId: accessData.companyId
          ? String(accessData.companyId)
          : null,
      };

      if (userAccess.status !== "approved") {
        setCurrentUserAccess(userAccess);
        setCompanies([]);
        setEmployees([]);
        setLeaveRequests([]);

        throw new Error(
          "This user does not have approved BizCentral access."
        );
      }

      setCurrentUserAccess(userAccess);

      const edoCompanyId =
        userAccess.userType === "edo"
          ? userAccess.companyId
          : null;

      if (
        userAccess.userType === "edo" &&
        !edoCompanyId
      ) {
        throw new Error(
          "This EDO user does not have a companyId assigned in userAccess."
        );
      }

      /* ---------------------------------------------------
         COMPANIES
      --------------------------------------------------- */

      const companySnapshot =
        await getDocs(
          collection(
            db,
            "companies"
          )
        );

      const companyData =
        companySnapshot.docs
          .map(
            (companyDoc) => {
              const data =
                companyDoc.data();

              return {
                id:
                  data.id ||
                  companyDoc.id,

                name:
                  data.name ||
                  "",

                site:
                  data.site ||
                  "",

                type:
                  data.type ||
                  "",
              };
            }
          )
          .filter(
            (company) =>
              company.type === "edo" &&
              (
                userAccess.userType !== "edo" ||
                company.id === edoCompanyId
              )
          )
          .sort(
            (a, b) =>
              a.name.localeCompare(
                b.name
              )
          );

      setCompanies(
        companyData
      );

      if (
        userAccess.userType === "edo" &&
        edoCompanyId
      ) {
        setEdoFilter(edoCompanyId);
        setFormEdoId(edoCompanyId);
      }

      /* ---------------------------------------------------
         EMPLOYEES
      --------------------------------------------------- */

      /*
        IMPORTANT:

        Firestore security rules are not filters.

        TASKRAFT:
        - May query the complete employees collection.

        EDO:
        - Must query only employees whose edoId matches
          the companyId in userAccess/{uid}.
      */

      const employeeCollection =
        collection(
          db,
          "employees"
        );

      const employeeQuery =
        userAccess.userType === "edo"
          ? query(
              employeeCollection,
              where(
                "edoId",
                "==",
                edoCompanyId
              )
            )
          : employeeCollection;

      const employeeSnapshot =
        await getDocs(
          employeeQuery
        );

      const employeeData:
        Employee[] =
        employeeSnapshot.docs.map(
          (employeeDoc) => {
            const data =
              employeeDoc.data();

            return {
              id:
                data.id ||
                employeeDoc.id,

              employeeCode:
                data.employeeCode ||
                "",

              firstName:
                data.firstName ||
                "",

              surname:
                data.surname ||
                "",

              edoId:
                data.edoId ||
                "",

              edoName:
                data.edoName ||
                "",

              site:
                data.site ||
                "",

              occupation:
                data.occupation ||
                "",

              workWeek:
                data.workWeek ||
                "",

              appointmentDate:
                data.appointmentDate ||
                "",

              status:
                data.status ||
                "",

              terminationDate:
                data.terminationDate ||
                null,
            };
          }
        );

      employeeData.sort(
        (a, b) => {
          const edoCompare =
            a.edoName.localeCompare(
              b.edoName
            );

          if (
            edoCompare !== 0
          ) {
            return edoCompare;
          }

          const surnameCompare =
            a.surname.localeCompare(
              b.surname
            );

          if (
            surnameCompare !== 0
          ) {
            return surnameCompare;
          }

          return (
            a.firstName.localeCompare(
              b.firstName
            )
          );
        }
      );

      setEmployees(
        employeeData
      );

      /* ---------------------------------------------------
         LEAVE REQUESTS
      --------------------------------------------------- */

      const leaveCollection =
        collection(
          db,
          "leaveRequests"
        );

      const leaveQuery =
        userAccess.userType === "edo"
          ? query(
              leaveCollection,
              where(
                "edoId",
                "==",
                edoCompanyId
              )
            )
          : leaveCollection;

      const leaveSnapshot =
        await getDocs(
          leaveQuery
        );

      const leaveData: LeaveRequest[] =
        leaveSnapshot.docs.map(
          (leaveDoc) => {
            const data = leaveDoc.data();

            return {
              id: leaveDoc.id,
              employeeId: data.employeeId || "",
              employeeCode: data.employeeCode || "",
              employeeName: data.employeeName || "",
              edoId: data.edoId || "",
              edoName: data.edoName || "",
              site: data.site || "",
              leaveType: data.leaveType || "",
              fromDate: data.fromDate || "",
              toDate: data.toDate || "",
              days: Number(data.days || 0),
              reason: data.reason || "",
              workWeek: data.workWeek || "",
              status: data.status || "pending",
              requestedAt: data.requestedAt,
              approvedAt: data.approvedAt,
              approvedBy: data.approvedBy || null,
              approvedByName: data.approvedByName || null,
              rejectedAt: data.rejectedAt,
              rejectedBy: data.rejectedBy || null,
              rejectedByName: data.rejectedByName || null,
              rejectionReason: data.rejectionReason || null,
            };
          }
        );

      leaveData.sort((a, b) => {
        if (a.fromDate !== b.fromDate) {
          return b.fromDate.localeCompare(a.fromDate);
        }

        return b.id.localeCompare(a.id);
      });

      setLeaveRequests(leaveData);

    } catch (error) {
      console.error(
        "Error loading leave data:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Unable to load leave management data."
      );

    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const unsubscribe =
      onAuthStateChanged(
        auth,
        (user) => {
          if (!user) {
            setCurrentUserAccess(null);
            setCompanies([]);
            setEmployees([]);
            setLeaveRequests([]);
            setLoading(false);
            setError(
              "You must be signed in to access Leave Management."
            );
            return;
          }

          loadData(user);
        }
      );

    return () => unsubscribe();
  }, []);

  /* =======================================================
     EMPLOYEES AVAILABLE FOR NEW REQUEST

     Employee must:
     - belong to selected EDO
     - currently be employed
     - not be the EDO
  ======================================================= */

  const formEmployees =
    useMemo(() => {
      if (!formEdoId) {
        return [];
      }

      return employees.filter(
        (employee) =>
          employee.edoId ===
            formEdoId &&
          isEmployed(
            employee
          ) &&
          !isEdo(
            employee
          )
      );
    }, [
      employees,
      formEdoId,
    ]);

  /* =======================================================
     SELECTED EMPLOYEE
  ======================================================= */

  const selectedEmployee =
    useMemo(() => {
      return employees.find(
        (employee) =>
          employee.id ===
          formEmployeeId
      );
    }, [
      employees,
      formEmployeeId,
    ]);

  /* =======================================================
     LEAVE DAYS
  ======================================================= */

  const leaveDays =
  useMemo(() => {

    if (!selectedEmployee) {
      return 0;
    }

    return calculateWorkingDays(
      formFromDate,
      formToDate,
      selectedEmployee.workWeek
    );

  }, [
    formFromDate,
    formToDate,
    selectedEmployee,
  ]);

  /* =======================================================
     REGISTER FILTERING
  ======================================================= */

  const filteredLeaveRequests =
    useMemo(() => {
      return leaveRequests.filter(
        (request) => {
          const searchable =
            [
              request.employeeCode,
              request.employeeName,
              request.edoName,
              request.site,
              leaveTypeLabel(
                request.leaveType
              ),
            ]
              .join(" ")
              .toLowerCase();

          const matchesSearch =
            searchable.includes(
              search
                .trim()
                .toLowerCase()
            );

          const matchesEdo =
            edoFilter ===
              "all" ||
            request.edoId ===
              edoFilter;

          const matchesType =
            typeFilter ===
              "all" ||
            request.leaveType ===
              typeFilter;

          const matchesStatus =
            statusFilter ===
              "all" ||
            request.status ===
              statusFilter;

          return (
            matchesSearch &&
            matchesEdo &&
            matchesType &&
            matchesStatus
          );
        }
      );
    }, [
      leaveRequests,
      search,
      edoFilter,
      typeFilter,
      statusFilter,
    ]);

  /* =======================================================
     SUMMARY
  ======================================================= */

  const today =
    getToday();

  const pendingCount =
    leaveRequests.filter(
      (request) =>
        request.status ===
        "pending"
    ).length;

  const approvedCount =
    leaveRequests.filter(
      (request) =>
        request.status ===
        "approved"
    ).length;

  const onLeaveTodayCount =
    leaveRequests.filter(
      (request) =>
        request.status ===
          "approved" &&
        request.fromDate <=
          today &&
        request.toDate >=
          today
    ).length;

  const sickLeaveCount =
    leaveRequests.filter(
      (request) =>
        request.leaveType ===
        "sick_leave"
    ).length;

  async function refreshData() {
    const user = auth.currentUser;

    if (!user) {
      throw new Error(
        "No authenticated user is available."
      );
    }

    await loadData(user);
  }

  /* =======================================================
     RESET FORM
  ======================================================= */

  function resetForm() {
    /*
      Keep an EDO user's company locked to their
      assigned userAccess company after submit/cancel.

      Taskraft users return to a blank EDO selection.
    */
    setFormEdoId(
      currentUserAccess?.userType === "edo"
        ? currentUserAccess.companyId || ""
        : ""
    );

    setFormEmployeeId("");
    setFormLeaveType("");
    setFormFromDate("");
    setFormToDate("");
    setFormReason("");
  }

  /* =======================================================
     APPROVE / REJECT LEAVE
  ======================================================= */

  async function approveLeaveRequest(
    request: LeaveRequest
  ) {
    const confirmed = window.confirm(
      `Approve ${request.employeeName}'s ${leaveTypeLabel(
        request.leaveType
      )} request from ${formatDate(
        request.fromDate
      )} to ${formatDate(request.toDate)}?`
    );

    if (!confirmed) {
      return;
    }

    const user = auth.currentUser;

    if (!user || !currentUserAccess) {
      setError(
        "Your user access could not be verified. Please sign in again."
      );
      return;
    }

    if (
      currentUserAccess.userType === "edo" &&
      currentUserAccess.companyId !== request.edoId
    ) {
      setError(
        "You cannot approve leave for another EDO business."
      );
      return;
    }

    try {
      setUpdatingRequestId(request.id);
      setError("");
      setMessage("");

      await updateDoc(
        doc(db, "leaveRequests", request.id),
        {
          status: "approved",
          approvedAt: serverTimestamp(),
          approvedBy: user.uid,
          approvedByName:
            currentUserAccess.name || "Unknown User",
          rejectedAt: null,
          rejectedBy: null,
          rejectedByName: null,
          rejectionReason: null,
        }
      );

      await refreshData();

      setMessage(
        `${request.employeeName}'s leave request was approved successfully.`
      );
    } catch (error) {
      console.error(
        "Error approving leave request:",
        error
      );

      setError(
        "The leave request could not be approved. Please check the browser console for details."
      );
    } finally {
      setUpdatingRequestId("");
    }
  }

  async function rejectLeaveRequest(
    request: LeaveRequest
  ) {
    const reason = window.prompt(
      `Reason for rejecting ${request.employeeName}'s leave request:`
    );

    if (reason === null) {
      return;
    }

    const cleanReason = reason.trim();

    if (!cleanReason) {
      alert(
        "Please enter a rejection reason."
      );
      return;
    }

    const confirmed = window.confirm(
      `Reject ${request.employeeName}'s leave request?`
    );

    if (!confirmed) {
      return;
    }

    const user = auth.currentUser;

    if (!user || !currentUserAccess) {
      setError(
        "Your user access could not be verified. Please sign in again."
      );
      return;
    }

    if (
      currentUserAccess.userType === "edo" &&
      currentUserAccess.companyId !== request.edoId
    ) {
      setError(
        "You cannot reject leave for another EDO business."
      );
      return;
    }

    try {
      setUpdatingRequestId(request.id);
      setError("");
      setMessage("");

      await updateDoc(
        doc(db, "leaveRequests", request.id),
        {
          status: "rejected",
          approvedAt: null,
          approvedBy: null,
          approvedByName: null,
          rejectedAt: serverTimestamp(),
          rejectedBy: user.uid,
          rejectedByName:
            currentUserAccess.name || "Unknown User",
          rejectionReason: cleanReason,
        }
      );

      await refreshData();

      setMessage(
        `${request.employeeName}'s leave request was rejected.`
      );
    } catch (error) {
      console.error(
        "Error rejecting leave request:",
        error
      );

      setError(
        "The leave request could not be rejected. Please check the browser console for details."
      );
    } finally {
      setUpdatingRequestId("");
    }
  }

  /* =======================================================
     SUBMIT LEAVE REQUEST
  ======================================================= */

  async function submitLeaveRequest() {
    setError("");
    setMessage("");

    if (!formEdoId) {
      alert("Please select an EDO business.");
      return;
    }

    if (!selectedEmployee) {
      alert("Please select an employee.");
      return;
    }

    if (!selectedEmployee.workWeek) {
      alert(
        "This employee does not have a Work Week assigned. Please update the employee record before capturing leave."
      );
      return;
    }

    if (
      selectedEmployee.workWeek !== "5_day" &&
      selectedEmployee.workWeek !== "6_day"
    ) {
      alert(
        "This employee has an invalid Work Week setting. Please update the employee record before capturing leave."
      );
      return;
    }

    if (!formLeaveType) {
      alert("Please select a leave type.");
      return;
    }

    if (!formFromDate || !formToDate) {
      alert("Please select the leave dates.");
      return;
    }

    if (formFromDate > formToDate) {
      alert("The From date cannot be after the To date.");
      return;
    }

    if (leaveDays <= 0) {
      alert("The selected period contains no working days.");
      return;
    }

    const user = auth.currentUser;

    if (!user || !currentUserAccess) {
      setError(
        "Your user access could not be verified. Please sign in again."
      );
      return;
    }

    if (
      currentUserAccess.userType === "edo" &&
      currentUserAccess.companyId !== selectedEmployee.edoId
    ) {
      setError(
        "You cannot create leave for another EDO business."
      );
      return;
    }

    try {
      setSavingLeave(true);

      await addDoc(
        collection(db, "leaveRequests"),
        {
          employeeId: selectedEmployee.id,
          employeeCode: selectedEmployee.employeeCode,
          employeeName:
            `${selectedEmployee.firstName} ${selectedEmployee.surname}`.trim(),

          edoId: selectedEmployee.edoId,
          edoName: selectedEmployee.edoName,
          site: selectedEmployee.site,

          leaveType: formLeaveType,
          fromDate: formFromDate,
          toDate: formToDate,
          days: leaveDays,
          workWeek: selectedEmployee.workWeek,
          reason: formReason.trim(),

          status: "pending",
          requestedAt: serverTimestamp(),
          requestedBy: user.uid,
          requestedByName:
            currentUserAccess.name || "Unknown User",

          approvedAt: null,
          approvedBy: null,
          approvedByName: null,
          rejectedAt: null,
          rejectedBy: null,
          rejectedByName: null,
          rejectionReason: null,
        }
      );

      await refreshData();

      setMessage(
        "Leave request submitted successfully and saved to Firebase."
      );

      resetForm();
      setShowNewRequest(false);

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } catch (error) {
      console.error(
        "Error saving leave request:",
        error
      );

      setError(
        "Leave request could not be saved. Please check your Firestore permissions and try again."
      );

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } finally {
      setSavingLeave(false);
    }
  }

  /* =======================================================
     PAGE
  ======================================================= */

  return (
    <div className="flex flex-col gap-8">

      {/* ===================================================
          HEADER
      =================================================== */}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

        <div className="flex items-center gap-4">

          <Button
            variant="outline"
            size="icon"
            onClick={() =>
              router.push(
                "/people"
              )
            }
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div>

            <h1 className="text-3xl font-bold tracking-tight">
              Leave Management
            </h1>

            <p className="text-muted-foreground">
              Manage employee leave across
              EDO businesses.
            </p>

          </div>

        </div>

        <Button
          onClick={() => {
            setShowNewRequest(
              (current) =>
                !current
            );

            setMessage("");
          }}
        >
          <Plus className="mr-2 h-4 w-4" />

          New Leave Request
        </Button>

      </div>

      {/* ===================================================
          ERROR / MESSAGE
      =================================================== */}

      {error && (

        <div className="rounded-md border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-700">
          {error}
        </div>

      )}

      {message && (

        <div className="rounded-md border border-green-500/40 bg-green-500/5 p-4 text-sm text-green-700">
          {message}
        </div>

      )}

      {/* ===================================================
          SUMMARY
      =================================================== */}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

        {/* PENDING */}

        <Card>

          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">

            <CardTitle className="text-sm font-medium">
              Pending
            </CardTitle>

            <Clock3 className="h-4 w-4 text-muted-foreground" />

          </CardHeader>

          <CardContent>

            <div className="text-2xl font-bold">
              {pendingCount}
            </div>

            <p className="text-xs text-muted-foreground">
              Awaiting approval
            </p>

          </CardContent>

        </Card>

        {/* APPROVED */}

        <Card>

          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">

            <CardTitle className="text-sm font-medium">
              Approved
            </CardTitle>

            <CheckCircle2 className="h-4 w-4 text-green-600" />

          </CardHeader>

          <CardContent>

            <div className="text-2xl font-bold">
              {approvedCount}
            </div>

            <p className="text-xs text-muted-foreground">
              Approved requests
            </p>

          </CardContent>

        </Card>

        {/* ON LEAVE TODAY */}

        <Card>

          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">

            <CardTitle className="text-sm font-medium">
              On Leave Today
            </CardTitle>

            <Users className="h-4 w-4 text-muted-foreground" />

          </CardHeader>

          <CardContent>

            <div className="text-2xl font-bold">
              {onLeaveTodayCount}
            </div>

            <p className="text-xs text-muted-foreground">
              Approved leave today
            </p>

          </CardContent>

        </Card>

        {/* SICK LEAVE */}

        <Card>

          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">

            <CardTitle className="text-sm font-medium">
              Sick Leave
            </CardTitle>

            <Stethoscope className="h-4 w-4 text-muted-foreground" />

          </CardHeader>

          <CardContent>

            <div className="text-2xl font-bold">
              {sickLeaveCount}
            </div>

            <p className="text-xs text-muted-foreground">
              Sick leave requests
            </p>

          </CardContent>

        </Card>

      </div>

      {/* ===================================================
          NEW LEAVE REQUEST
      =================================================== */}

      {showNewRequest && (

        <Card className="border-primary/30">

          <CardHeader>

            <div className="flex items-start justify-between gap-4">

              <div>

                <CardTitle>
                  New Leave Request
                </CardTitle>

                <CardDescription>
                  Capture an employee leave
                  request.
                </CardDescription>

              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setShowNewRequest(
                    false
                  );

                  resetForm();
                }}
              >
                <XCircle className="h-5 w-5" />
              </Button>

            </div>

          </CardHeader>

          <CardContent className="space-y-6">

            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">

              {/* EDO */}

              <div className="grid gap-2">

                <Label>
                  EDO Business
                </Label>

                <Select
                  value={
                    formEdoId
                  }
                  onValueChange={(
                    value
                  ) => {
                    setFormEdoId(
                      value
                    );

                    setFormEmployeeId(
                      ""
                    );
                  }}
                  disabled={
                    currentUserAccess?.userType === "edo"
                  }
                >

                  <SelectTrigger>
                    <SelectValue placeholder="Select EDO business" />
                  </SelectTrigger>

                  <SelectContent>

                    {companies.map(
                      (company) => (

                        <SelectItem
                          key={
                            company.id
                          }
                          value={
                            company.id
                          }
                        >
                          {company.name}
                        </SelectItem>

                      )
                    )}

                  </SelectContent>

                </Select>

              </div>

              {/* EMPLOYEE */}

              <div className="grid gap-2">

                <Label>
                  Employee
                </Label>

                <Select
                  value={
                    formEmployeeId
                  }
                  onValueChange={
                    setFormEmployeeId
                  }
                  disabled={
                    !formEdoId
                  }
                >

                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        formEdoId
                          ? "Select employee"
                          : "Select EDO first"
                      }
                    />
                  </SelectTrigger>

                  <SelectContent>

                    {formEmployees.map(
                      (employee) => (

                        <SelectItem
                          key={
                            employee.id
                          }
                          value={
                            employee.id
                          }
                        >
                          {employee.firstName}{" "}
                          {employee.surname}
                          {" — "}
                          {employee.employeeCode}
                        </SelectItem>

                      )
                    )}

                  </SelectContent>

                </Select>

              </div>

              {/* LEAVE TYPE */}

              <div className="grid gap-2">

                <Label>
                  Leave Type
                </Label>

                <Select
                  value={
                    formLeaveType
                  }
                  onValueChange={
                    setFormLeaveType
                  }
                >

                  <SelectTrigger>
                    <SelectValue placeholder="Select leave type" />
                  </SelectTrigger>

                  <SelectContent>

                    <SelectItem value="annual_leave">
                      Annual Leave
                    </SelectItem>

                    <SelectItem value="sick_leave">
                      Sick Leave
                    </SelectItem>

                    <SelectItem value="family_responsibility">
                      Family Responsibility
                    </SelectItem>

                    <SelectItem value="unpaid_leave">
                      Unpaid Leave
                    </SelectItem>

                  </SelectContent>

                </Select>

              </div>

              {/* DAYS */}

              <div className="grid gap-2">

                <Label>
                  Working Days
                </Label>

                <div className="flex h-10 items-center rounded-md border bg-muted/30 px-3">

                  <span className="text-lg font-semibold">
                    {leaveDays}
                  </span>

                  <span className="ml-2 text-sm text-muted-foreground">
                    {leaveDays === 1
                      ? "day"
                      : "days"}
                  </span>

                </div>

              </div>

            </div>

            {/* DATES */}

            <div className="grid gap-5 md:grid-cols-2">

              <div className="grid gap-2">

                <Label>
                  From Date
                </Label>

                <Input
                  type="date"
                  value={
                    formFromDate
                  }
                  onChange={(
                    event
                  ) =>
                    setFormFromDate(
                      event.target.value
                    )
                  }
                />

              </div>

              <div className="grid gap-2">

                <Label>
                  To Date
                </Label>

                <Input
                  type="date"
                  value={
                    formToDate
                  }
                  min={
                    formFromDate ||
                    undefined
                  }
                  onChange={(
                    event
                  ) =>
                    setFormToDate(
                      event.target.value
                    )
                  }
                />

              </div>

            </div>

            {/* EMPLOYEE INFORMATION */}

            {selectedEmployee && (

              <div className="rounded-lg border bg-muted/20 p-4">

                <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-5">

                  {/* EMPLOYEE */}

                  <div>

                    <div className="text-xs text-muted-foreground">
                      Employee
                    </div>

                    <div className="font-medium">
                      {selectedEmployee.firstName}{" "}
                      {selectedEmployee.surname}
                    </div>

                  </div>

                  {/* EMPLOYEE CODE */}

                  <div>

                    <div className="text-xs text-muted-foreground">
                      Employee Code
                    </div>

                    <div className="font-medium">
                      {selectedEmployee.employeeCode ||
                        "—"}
                    </div>

                  </div>

                  {/* WORK WEEK */}

                  <div>

                    <div className="text-xs text-muted-foreground">
                      Work Week
                    </div>

                    <div className="mt-1">

                      {selectedEmployee.workWeek === "5_day" && (

                        <Badge
                          variant="outline"
                          className="border-blue-300 bg-blue-50 text-blue-700"
                        >
                          5 Day Worker
                        </Badge>

                      )}

                      {selectedEmployee.workWeek === "6_day" && (

                        <Badge
                          variant="outline"
                          className="border-amber-300 bg-amber-50 text-amber-700"
                        >
                          6 Day Worker
                        </Badge>

                      )}

                      {!selectedEmployee.workWeek && (

                        <Badge variant="destructive">
                          Not Set
                        </Badge>

                      )}

                      {selectedEmployee.workWeek &&
                        selectedEmployee.workWeek !== "5_day" &&
                        selectedEmployee.workWeek !== "6_day" && (

                        <Badge variant="destructive">
                          Invalid
                        </Badge>

                      )}

                    </div>

                  </div>

                  {/* EDO BUSINESS */}

                  <div>

                    <div className="text-xs text-muted-foreground">
                      EDO Business
                    </div>

                    <div className="font-medium">
                      {selectedEmployee.edoName}
                    </div>

                  </div>

                  {/* SITE */}

                  <div>

                    <div className="text-xs text-muted-foreground">
                      Site
                    </div>

                    <div className="font-medium capitalize">
                      {selectedEmployee.site ||
                        "—"}
                    </div>

                  </div>

                </div>

              </div>

            )}

            {/* REASON */}

            <div className="grid gap-2">

              <Label>
                Reason / Comments
              </Label>

              <Input
                value={
                  formReason
                }
                onChange={(
                  event
                ) =>
                  setFormReason(
                    event.target.value
                  )
                }
                placeholder="Optional comments or reason..."
              />

            </div>

            {/* INFO */}

            <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-4 text-sm">

              <div className="flex gap-3">

                <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />

                <div>

                  <div className="font-medium text-blue-700">
                    Leave period storage
                  </div>

                  <div className="mt-1 text-muted-foreground">
                    BizCentral will store one leave
                    request using the From and To dates.
                    It will not create a separate
                    Firestore record for every day.
                  </div>

                </div>

              </div>

            </div>

            {/* BUTTONS */}

            <div className="flex justify-end gap-3">

              <Button
                variant="outline"
                onClick={() => {
                  setShowNewRequest(
                    false
                  );

                  resetForm();
                }}
              >
                Cancel
              </Button>

              <Button
                onClick={
                  submitLeaveRequest
                }
                disabled={savingLeave}
              >
                {savingLeave ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                {savingLeave
                  ? "Saving Leave..."
                  : "Add Leave Request"}
              </Button>

            </div>

          </CardContent>

        </Card>

      )}

      {/* ===================================================
          LEAVE REGISTER
      =================================================== */}

      <Card>

        <CardHeader>

          <CardTitle>
            Leave Register
          </CardTitle>

          <CardDescription>
            View and manage employee leave
            across all EDO businesses.
          </CardDescription>

        </CardHeader>

        <CardContent>

          {/* FILTERS */}

          <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">

            {/* SEARCH */}

            <div className="relative">

              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />

              <Input
                placeholder="Search leave..."
                value={search}
                onChange={(
                  event
                ) =>
                  setSearch(
                    event.target.value
                  )
                }
                className="pl-9"
              />

            </div>

            {/* EDO */}

            <Select
              value={edoFilter}
              onValueChange={
                setEdoFilter
              }
              disabled={
                currentUserAccess?.userType === "edo"
              }
            >

              <SelectTrigger>
                <SelectValue placeholder="EDO Business" />
              </SelectTrigger>

              <SelectContent>

                {currentUserAccess?.userType !== "edo" && (
                  <SelectItem value="all">
                    All EDO Businesses
                  </SelectItem>
                )}

                {companies.map(
                  (company) => (

                    <SelectItem
                      key={
                        company.id
                      }
                      value={
                        company.id
                      }
                    >
                      {company.name}
                    </SelectItem>

                  )
                )}

              </SelectContent>

            </Select>

            {/* LEAVE TYPE */}

            <Select
              value={
                typeFilter
              }
              onValueChange={
                setTypeFilter
              }
            >

              <SelectTrigger>
                <SelectValue placeholder="Leave Type" />
              </SelectTrigger>

              <SelectContent>

                <SelectItem value="all">
                  All Leave Types
                </SelectItem>

                <SelectItem value="annual_leave">
                  Annual Leave
                </SelectItem>

                <SelectItem value="sick_leave">
                  Sick Leave
                </SelectItem>

                <SelectItem value="family_responsibility">
                  Family Responsibility
                </SelectItem>

                <SelectItem value="unpaid_leave">
                  Unpaid Leave
                </SelectItem>

              </SelectContent>

            </Select>

            {/* STATUS */}

            <Select
              value={
                statusFilter
              }
              onValueChange={
                setStatusFilter
              }
            >

              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>

              <SelectContent>

                <SelectItem value="all">
                  All Statuses
                </SelectItem>

                <SelectItem value="pending">
                  Pending
                </SelectItem>

                <SelectItem value="approved">
                  Approved
                </SelectItem>

                <SelectItem value="rejected">
                  Rejected
                </SelectItem>

              </SelectContent>

            </Select>

          </div>

          {/* TABLE */}

          {loading ? (

            <div className="flex h-48 items-center justify-center">

              <div className="flex items-center gap-3 text-muted-foreground">

                <Loader2 className="h-5 w-5 animate-spin" />

                Loading leave management...

              </div>

            </div>

          ) : (

            <div className="overflow-x-auto rounded-md border">

              <Table>

                <TableHeader>

                  <TableRow>

                    <TableHead>
                      Employee
                    </TableHead>

                    <TableHead>
                      EDO Business
                    </TableHead>

                    <TableHead>
                      Leave Type
                    </TableHead>

                    <TableHead>
                      From
                    </TableHead>

                    <TableHead>
                      To
                    </TableHead>

                    <TableHead>
                      Days
                    </TableHead>

                    <TableHead>
                      Status
                    </TableHead>

                    <TableHead className="text-right">
                      Actions
                    </TableHead>

                  </TableRow>

                </TableHeader>

                <TableBody>

                  {filteredLeaveRequests.map(
                    (request) => (

                      <TableRow
                        key={
                          request.id
                        }
                      >

                        <TableCell>

                          <div className="font-medium">
                            {request.employeeName}
                          </div>

                          <div className="text-xs text-muted-foreground">
                            {request.employeeCode}
                          </div>

                        </TableCell>

                        <TableCell>

                          <div>
                            {request.edoName}
                          </div>

                          <div className="text-xs capitalize text-muted-foreground">
                            {request.site}
                          </div>

                        </TableCell>

                        <TableCell>
                          {leaveTypeLabel(
                            request.leaveType
                          )}
                        </TableCell>

                        <TableCell>
                          {formatDate(
                            request.fromDate
                          )}
                        </TableCell>

                        <TableCell>
                          {formatDate(
                            request.toDate
                          )}
                        </TableCell>

                        <TableCell>
                          {request.days}
                        </TableCell>

                        <TableCell>

                          {request.status ===
                            "pending" && (

                            <Badge variant="secondary">
                              Pending
                            </Badge>

                          )}

                          {request.status ===
                            "approved" && (

                            <Badge className="bg-green-600 hover:bg-green-600">
                              Approved
                            </Badge>

                          )}

                          {request.status ===
                            "rejected" && (

                            <div className="space-y-1">
                              <Badge variant="destructive">
                                Rejected
                              </Badge>

                              {request.rejectionReason && (
                                <div className="max-w-56 text-xs text-muted-foreground">
                                  {request.rejectionReason}
                                </div>
                              )}
                            </div>

                          )}

                        </TableCell>

                        <TableCell className="text-right">

                          {request.status === "pending" ? (

                            <div className="flex justify-end gap-2">

                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={
                                  updatingRequestId === request.id
                                }
                                onClick={() =>
                                  approveLeaveRequest(request)
                                }
                                className="border-green-300 text-green-700 hover:bg-green-50 hover:text-green-800"
                              >
                                {updatingRequestId === request.id ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="mr-2 h-4 w-4" />
                                )}
                                Approve
                              </Button>

                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={
                                  updatingRequestId === request.id
                                }
                                onClick={() =>
                                  rejectLeaveRequest(request)
                                }
                                className="border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Reject
                              </Button>

                            </div>

                          ) : (

                            <span className="text-xs text-muted-foreground">
                              Completed
                            </span>

                          )}

                        </TableCell>

                      </TableRow>

                    )
                  )}

                  {filteredLeaveRequests.length ===
                    0 && (

                    <TableRow>

                      <TableCell
                        colSpan={8}
                        className="h-32 text-center"
                      >

                        <div className="flex flex-col items-center justify-center">

                          <CalendarDays className="mb-3 h-8 w-8 text-muted-foreground" />

                          <div className="font-medium">
                            No leave requests
                          </div>

                          <div className="mt-1 text-sm text-muted-foreground">
                            Leave requests will appear
                            here once captured.
                          </div>

                        </div>

                      </TableCell>

                    </TableRow>

                  )}

                </TableBody>

              </Table>

            </div>

          )}

        </CardContent>

      </Card>

    </div>
  );
}