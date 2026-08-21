"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";


import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  CalendarCheck,
  CalendarDays,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Upload,
  UserCheck,
  Users,
} from "lucide-react";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import {
  onAuthStateChanged,
  User,
} from "firebase/auth";

import { auth, db } from "@/lib/firebase";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/* =========================================================
   CONSTANTS
========================================================= */

const MINIMUM_EMPLOYEES = 3;

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

  idNumber: string;
  cellphone: string;

  dateOfBirth: string;
  appointmentDate: string;

  status: string;

  terminationDate?: string | null;
  terminationReason?: string | null;
};

type EdoCompany = {
  id: string;
  name: string;
  site: string;
  type: string;
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

function isEdo(employee: Employee) {
  return (
    employee.occupation
      .trim()
      .toLowerCase() === "edo"
  );
}

function isEmployed(employee: Employee) {
  return (
    employee.status
      .trim()
      .toLowerCase() === "employed"
  );
}

/* =========================================================
   PAGE
========================================================= */

export default function PeoplePage() {
  const router = useRouter();

  /* =======================================================
     DATA
  ======================================================= */

  const [employees, setEmployees] =
    useState<Employee[]>([]);

  const [edoCompanies, setEdoCompanies] =
    useState<EdoCompany[]>([]);

  const [currentUserAccess, setCurrentUserAccess] =
    useState<UserAccess | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  /* =======================================================
     FILTERS
  ======================================================= */

  const [search, setSearch] =
    useState("");

  const [edoFilter, setEdoFilter] =
    useState("all");

  const [siteFilter, setSiteFilter] =
    useState("all");

  const [statusFilter, setStatusFilter] =
    useState("all");

  const [peopleFilter, setPeopleFilter] =
    useState("all");

  /* =======================================================
     LOAD FIREBASE DATA
  ======================================================= */

  async function loadData(user: User) {
    try {
      setLoading(true);
      setError("");

      /* ---------------------------------------------------
         LOAD CURRENT USER ACCESS
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
        setEdoCompanies([]);
        setEmployees([]);

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
        setEdoCompanies([]);
        setEmployees([]);

        throw new Error(
          "This user does not have approved BizCentral access."
        );
      }

      const isEdoUser =
        userAccess.userType === "edo";

      const edoCompanyId =
        isEdoUser
          ? userAccess.companyId
          : null;

      if (
        isEdoUser &&
        !edoCompanyId
      ) {
        throw new Error(
          "This EDO user does not have a companyId assigned in userAccess."
        );
      }

      setCurrentUserAccess(userAccess);

      /* ---------------------------------------------------
         LOAD EDO COMPANIES
      --------------------------------------------------- */

      const companyCollection =
        collection(db, "companies");

      const companyQuery =
        isEdoUser
          ? query(
              companyCollection,
              where(
                "id",
                "==",
                edoCompanyId
              )
            )
          : companyCollection;

      const companySnapshot =
        await getDocs(
          companyQuery
        );

      const companies: EdoCompany[] =
        companySnapshot.docs
          .map((companyDoc) => {
            const data =
              companyDoc.data();

            return {
              id:
                data.id ||
                companyDoc.id,

              name:
                data.name || "",

              site:
                data.site || "",

              type:
                data.type || "",
            };
          })
          .filter(
            (company) =>
              company.type === "edo" &&
              (
                !isEdoUser ||
                company.id === edoCompanyId
              )
          )
          .sort((a, b) =>
            a.name.localeCompare(b.name)
          );

      setEdoCompanies(companies);

      if (
        isEdoUser &&
        edoCompanyId
      ) {
        setEdoFilter(edoCompanyId);
      }

      /* ---------------------------------------------------
         LOAD EMPLOYEES
      --------------------------------------------------- */

      const employeeCollection =
        collection(db, "employees");

      const employeeQuery =
        isEdoUser
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

      const employeeData: Employee[] =
        employeeSnapshot.docs.map(
          (employeeDoc) => {
            const data =
              employeeDoc.data();

            return {
              id:
                data.id ||
                employeeDoc.id,

              employeeCode:
                data.employeeCode || "",

              firstName:
                data.firstName || "",

              surname:
                data.surname || "",

              edoId:
                data.edoId || "",

              edoName:
                data.edoName || "",

              site:
                data.site || "",

              occupation:
                data.occupation || "",

              workWeek:
                data.workWeek || "",

              idNumber:
                data.idNumber || "",

              cellphone:
                data.cellphone || "",

              dateOfBirth:
                data.dateOfBirth || "",

              appointmentDate:
                data.appointmentDate || "",

              status:
                data.status || "",

              terminationDate:
                data.terminationDate ||
                null,

              terminationReason:
                data.terminationReason ||
                null,
            };
          }
        );

      const visibleEmployeeData =
        isEdoUser
          ? employeeData.filter(
              (employee) =>
                employee.edoId ===
                edoCompanyId
            )
          : employeeData;

      /* ---------------------------------------------------
         SORT EMPLOYEES

         EDO Business
         Surname
         First Name
      --------------------------------------------------- */

      visibleEmployeeData.sort(
        (a, b) => {
          const edoCompare =
            a.edoName.localeCompare(
              b.edoName
            );

          if (edoCompare !== 0) {
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

          return a.firstName.localeCompare(
            b.firstName
          );
        }
      );

      setEmployees(visibleEmployeeData);

      console.log(
        "EMPLOYEES:",
        visibleEmployeeData
      );

    } catch (error) {
      console.error(
        "Error loading People data:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Unable to load employee data from BizCentral."
      );

    } finally {
      setLoading(false);
    }
  }

  /* =======================================================
     LOAD ON PAGE OPEN
  ======================================================= */

  useEffect(() => {
    const unsubscribe =
      onAuthStateChanged(
        auth,
        (user) => {
          if (!user) {
            setCurrentUserAccess(null);
            setEdoCompanies([]);
            setEmployees([]);
            setLoading(false);
            setError(
              "You must be signed in to access People."
            );
            return;
          }

          loadData(user);
        }
      );

    return () => unsubscribe();
  }, []);

  /* =======================================================
     AVAILABLE SITES
  ======================================================= */

  const sites = useMemo(() => {
    return Array.from(
      new Set(
        edoCompanies
          .map(
            (company) =>
              company.site
          )
          .filter(Boolean)
      )
    ).sort();
  }, [edoCompanies]);

  /* =======================================================
     MAIN TABLE FILTERING
  ======================================================= */

  const filteredEmployees =
    useMemo(() => {

      return employees.filter(
        (employee) => {

          /* ---------------------------------------------
             SEARCH
          ---------------------------------------------- */

          const searchableText = [
            employee.employeeCode,
            employee.firstName,
            employee.surname,
            employee.edoName,
            employee.site,
            employee.occupation,
            employee.workWeek,
            employee.idNumber,
            employee.cellphone,
          ]
            .join(" ")
            .toLowerCase();

          const matchesSearch =
            searchableText.includes(
              search
                .trim()
                .toLowerCase()
            );

          /* ---------------------------------------------
             EDO BUSINESS
          ---------------------------------------------- */

          const matchesEdo =
            edoFilter === "all" ||
            employee.edoId ===
              edoFilter;

          /* ---------------------------------------------
             SITE
          ---------------------------------------------- */

          const matchesSite =
            siteFilter === "all" ||
            employee.site ===
              siteFilter;

          /* ---------------------------------------------
             STATUS
          ---------------------------------------------- */

          const matchesStatus =
            statusFilter === "all" ||
            employee.status
              .toLowerCase() ===
              statusFilter;

          /* ---------------------------------------------
             PEOPLE TYPE

             all       = EDO + Employees
             employees = exclude EDO
             edo       = EDO only
          ---------------------------------------------- */

          let matchesPeopleType =
            true;

          if (
            peopleFilter ===
            "employees"
          ) {
            matchesPeopleType =
              !isEdo(employee);
          }

          if (
            peopleFilter === "edo"
          ) {
            matchesPeopleType =
              isEdo(employee);
          }

          return (
            matchesSearch &&
            matchesEdo &&
            matchesSite &&
            matchesStatus &&
            matchesPeopleType
          );
        }
      );
    }, [
      employees,
      search,
      edoFilter,
      siteFilter,
      statusFilter,
      peopleFilter,
    ]);

  /* =======================================================
     SUMMARY COUNTS
  ======================================================= */

  const employedEmployees =
    employees.filter(
      (employee) =>
        isEmployed(employee)
    ).length;

  const terminatedEmployees =
    employees.filter(
      (employee) =>
        employee.status
          .trim()
          .toLowerCase() ===
        "terminated"
    ).length;

  const employeeEdoCount =
    new Set(
      employees
        .map(
          (employee) =>
            employee.edoId
        )
        .filter(Boolean)
    ).size;

  /* =======================================================
     VISIBLE EMPLOYEE COUNTS

     These respond to the table filters.
  ======================================================= */

  const visiblePeopleCount =
    filteredEmployees.length;

  const visibleNonEdoCount =
    filteredEmployees.filter(
      (employee) =>
        !isEdo(employee)
    ).length;

  const visibleEdoCount =
    filteredEmployees.filter(
      (employee) =>
        isEdo(employee)
    ).length;

  /* =======================================================
     COMPLIANCE DATA

     IMPORTANT:
     Search and People Type DO NOT affect compliance.

     Compliance is based on:
     - selected EDO
     - selected site
     - employed status
     - excludes occupation EDO
  ======================================================= */

  const complianceEmployees =
    useMemo(() => {

      return employees.filter(
        (employee) => {

          const matchesEdo =
            edoFilter === "all" ||
            employee.edoId ===
              edoFilter;

          const matchesSite =
            siteFilter === "all" ||
            employee.site ===
              siteFilter;

          return (
            matchesEdo &&
            matchesSite &&
            isEmployed(employee) &&
            !isEdo(employee)
          );
        }
      );

    }, [
      employees,
      edoFilter,
      siteFilter,
    ]);

  /* =======================================================
     SELECTED EDO
  ======================================================= */

  const selectedEdo =
    edoCompanies.find(
      (company) =>
        company.id === edoFilter
    );

  /* =======================================================
     SELECTED EDO COMPLIANCE
  ======================================================= */

  const selectedEdoEmployeeCount =
    edoFilter !== "all"
      ? complianceEmployees.length
      : 0;

  const selectedEdoIsCompliant =
    selectedEdoEmployeeCount >=
    MINIMUM_EMPLOYEES;

  const selectedEdoShortfall =
    Math.max(
      0,
      MINIMUM_EMPLOYEES -
        selectedEdoEmployeeCount
    );

  /* =======================================================
     OVERALL EDO COMPLIANCE

     Useful when "All EDO Businesses" is selected.
  ======================================================= */

  const edoCompliance =
    useMemo(() => {

      return edoCompanies
        .filter((company) => {
          if (
            siteFilter === "all"
          ) {
            return true;
          }

          return (
            company.site ===
            siteFilter
          );
        })
        .map((company) => {

          const employeeCount =
            employees.filter(
              (employee) =>
                employee.edoId ===
                  company.id &&
                isEmployed(
                  employee
                ) &&
                !isEdo(employee)
            ).length;

          return {
            edoId: company.id,
            edoName:
              company.name,
            employeeCount,
            compliant:
              employeeCount >=
              MINIMUM_EMPLOYEES,
          };
        });

    }, [
      edoCompanies,
      employees,
      siteFilter,
    ]);

  const compliantEdoCount =
    edoCompliance.filter(
      (edo) => edo.compliant
    ).length;

  const nonCompliantEdoCount =
    edoCompliance.filter(
      (edo) => !edo.compliant
    ).length;

  const isEdoUser =
    currentUserAccess?.userType ===
    "edo";

  const canManageEmployees =
    currentUserAccess?.userType ===
    "taskraft";

  async function refreshData() {
    const user = auth.currentUser;

    if (!user) {
      setError(
        "You must be signed in to refresh People."
      );
      return;
    }

    await loadData(user);
  }

  /* =======================================================
     CLEAR FILTERS
  ======================================================= */

  function clearFilters() {
    setSearch("");
    setEdoFilter(
      isEdoUser &&
      currentUserAccess?.companyId
        ? currentUserAccess.companyId
        : "all"
    );
    setSiteFilter("all");
    setStatusFilter("all");
    setPeopleFilter("all");
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

        <div>

          <h1 className="text-3xl font-bold tracking-tight">
            People
          </h1>

          <p className="text-muted-foreground">
            {isEdoUser
              ? "View people, attendance, leave and payroll for your EDO business."
              : "Manage employees, attendance, leave and payroll across EDO businesses."}
          </p>

        </div>

        <div className="flex flex-wrap gap-2">

          {/* REFRESH */}

          <Button
            variant="outline"
            onClick={refreshData}
            disabled={loading}
          >

            <RefreshCw
              className={`mr-2 h-4 w-4 ${
                loading
                  ? "animate-spin"
                  : ""
              }`}
            />

            Refresh

          </Button>

          <Button
            variant="outline"
            onClick={() =>
              router.push("/people/attendance")
            }
          >
            <CalendarCheck className="mr-2 h-4 w-4" />
            Attendance
          </Button>

          <Button
            variant="outline"
            onClick={() =>
              router.push("/people/leave")
            }
          >
            <CalendarDays className="mr-2 h-4 w-4" />
            Leave
          </Button>

          {/* TASKRAFT EMPLOYEE MANAGEMENT */}

          {canManageEmployees && (
            <>
              <Button
                variant="outline"
                onClick={() =>
                  router.push(
                    "/people/upload"
                  )
                }
              >
                <Upload className="mr-2 h-4 w-4" />
                Bulk Upload
              </Button>

              <Button
                onClick={() =>
                  router.push(
                    "/people/employee/new"
                  )
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Employee
              </Button>
            </>
          )}

        </div>

      </div>

      {/* ===================================================
          ERROR
      =================================================== */}

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ===================================================
          SUMMARY CARDS
      =================================================== */}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

        {/* TOTAL */}

        <Card>

          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">

            <CardTitle className="text-sm font-medium">
              Total People
            </CardTitle>

            <Users className="h-4 w-4 text-muted-foreground" />

          </CardHeader>

          <CardContent>

            <div className="text-2xl font-bold">
              {loading
                ? "..."
                : employees.length}
            </div>

            <p className="text-xs text-muted-foreground">
              EDOs and employees
            </p>

          </CardContent>

        </Card>

        {/* EMPLOYED */}

        <Card>

          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">

            <CardTitle className="text-sm font-medium">
              Employed
            </CardTitle>

            <UserCheck className="h-4 w-4 text-muted-foreground" />

          </CardHeader>

          <CardContent>

            <div className="text-2xl font-bold">
              {loading
                ? "..."
                : employedEmployees}
            </div>

            <p className="text-xs text-muted-foreground">
              Currently employed
            </p>

          </CardContent>

        </Card>

        {/* TERMINATED */}

        <Card>

          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">

            <CardTitle className="text-sm font-medium">
              Terminated
            </CardTitle>

            <Users className="h-4 w-4 text-muted-foreground" />

          </CardHeader>

          <CardContent>

            <div className="text-2xl font-bold">
              {loading
                ? "..."
                : terminatedEmployees}
            </div>

            <p className="text-xs text-muted-foreground">
              Historical employees
            </p>

          </CardContent>

        </Card>

        {/* EDO BUSINESSES */}

        <Card>

          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">

            <CardTitle className="text-sm font-medium">
              EDO Businesses
            </CardTitle>

            <Building2 className="h-4 w-4 text-muted-foreground" />

          </CardHeader>

          <CardContent>

            <div className="text-2xl font-bold">
              {loading
                ? "..."
                : employeeEdoCount}
            </div>

            <p className="text-xs text-muted-foreground">
              Businesses with people records
            </p>

          </CardContent>

        </Card>

      </div>

      {/* ===================================================
          COMPLIANCE CARD
      =================================================== */}

      {!loading && (
        <Card
          className={
            edoFilter !== "all"
              ? selectedEdoIsCompliant
                ? "border-green-500/50"
                : "border-red-500/50"
              : ""
          }
        >

          <CardHeader>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

              <div>

                <CardTitle>
                  Employee Compliance
                </CardTitle>

                <CardDescription>
                  Each EDO business must have
                  a minimum of{" "}
                  {MINIMUM_EMPLOYEES} employed
                  employees, excluding the EDO.
                </CardDescription>

              </div>

              {/* SELECTED EDO STATUS */}

              {edoFilter !== "all" &&
                selectedEdoIsCompliant && (
                  <Badge className="bg-green-600 hover:bg-green-600">
                    Compliant
                  </Badge>
                )}

              {edoFilter !== "all" &&
                !selectedEdoIsCompliant && (
                  <Badge variant="destructive">
                    Non-Compliant
                  </Badge>
                )}

            </div>

          </CardHeader>

          <CardContent>

            {/* ===============================================
                SINGLE EDO COMPLIANCE
            =============================================== */}

            {edoFilter !== "all" ? (

              <div
                className={
                  selectedEdoIsCompliant
                    ? "flex flex-col gap-4 rounded-lg border border-green-500/30 bg-green-500/5 p-5 sm:flex-row sm:items-center sm:justify-between"
                    : "flex flex-col gap-4 rounded-lg border border-red-500/30 bg-red-500/5 p-5 sm:flex-row sm:items-center sm:justify-between"
                }
              >

                <div className="flex items-center gap-4">

                  {selectedEdoIsCompliant ? (
                    <CheckCircle2 className="h-8 w-8 text-green-600" />
                  ) : (
                    <AlertTriangle className="h-8 w-8 text-red-600" />
                  )}

                  <div>

                    <div className="font-semibold">
                      {selectedEdo?.name ||
                        "Selected EDO"}
                    </div>

                    <div
                      className={
                        selectedEdoIsCompliant
                          ? "text-sm font-medium text-green-700"
                          : "text-sm font-medium text-red-700"
                      }
                    >

                      {selectedEdoIsCompliant
                        ? "Minimum employee requirement achieved"
                        : `Shortfall: ${selectedEdoShortfall} employee${
                            selectedEdoShortfall ===
                            1
                              ? ""
                              : "s"
                          }`}

                    </div>

                  </div>

                </div>

                <div className="text-left sm:text-right">

                  <div
                    className={
                      selectedEdoIsCompliant
                        ? "text-3xl font-bold text-green-700"
                        : "text-3xl font-bold text-red-700"
                    }
                  >
                    {selectedEdoEmployeeCount}
                    {" / "}
                    {MINIMUM_EMPLOYEES}
                  </div>

                  <div className="text-xs text-muted-foreground">
                    employed employees excluding
                    EDO
                  </div>

                </div>

              </div>

            ) : (

              /* =============================================
                  OVERALL COMPLIANCE
              ============================================= */

              <div className="grid gap-4 sm:grid-cols-3">

                <div className="rounded-lg border p-4">

                  <div className="text-sm text-muted-foreground">
                    EDOs Assessed
                  </div>

                  <div className="mt-1 text-2xl font-bold">
                    {edoCompliance.length}
                  </div>

                </div>

                <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4">

                  <div className="text-sm text-green-700">
                    Compliant
                  </div>

                  <div className="mt-1 text-2xl font-bold text-green-700">
                    {compliantEdoCount}
                  </div>

                </div>

                <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">

                  <div className="text-sm text-red-700">
                    Non-Compliant
                  </div>

                  <div className="mt-1 text-2xl font-bold text-red-700">
                    {nonCompliantEdoCount}
                  </div>

                  {/* SHOW NON-COMPLIANT EDOs */}

                  {nonCompliantEdoCount > 0 && (
                    <div className="mt-4 space-y-2 border-t border-red-500/20 pt-3">

                      {edoCompliance
                        .filter((edo) => !edo.compliant)
                        .map((edo) => {

                          const shortfall = Math.max(
                            0,
                            MINIMUM_EMPLOYEES - edo.employeeCount
                          );

                          return (
                            <button
                              key={edo.edoId}
                              type="button"
                              onClick={() => {
                                setEdoFilter(edo.edoId);
                                setPeopleFilter("all");
                                setStatusFilter("all");
                                setSearch("");
                              }}
                              className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left transition-colors hover:bg-red-500/10"
                            >
                              <div>

                                <div className="text-sm font-semibold text-red-700">
                                  {edo.edoName}
                                </div>

                                <div className="text-xs text-muted-foreground">
                                  Shortfall: {shortfall} employee
                                  {shortfall === 1 ? "" : "s"}
                                </div>

                              </div>

                              <div className="ml-4 whitespace-nowrap text-sm font-bold text-red-700">
                                {edo.employeeCount} / {MINIMUM_EMPLOYEES}
                              </div>

                            </button>
                          );
                        })}

                    </div>
                  )}

                </div>

              </div>

            )}

          </CardContent>

        </Card>
      )}

      {/* ===================================================
          EMPLOYEE REGISTER
      =================================================== */}

      <Card>

        <CardHeader>

          <CardTitle>
            Employee Register
          </CardTitle>

          <CardDescription>
            {isEdoUser
              ? "View and search people in your EDO business."
              : "View, search and manage people across all EDO businesses."}
          </CardDescription>

        </CardHeader>

        <CardContent>

          {/* =================================================
              FILTERS
          ================================================= */}

          <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-6">

            {/* SEARCH */}

            <div className="relative">

              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />

              <Input
                placeholder="Search employee..."
                value={search}
                onChange={(event) =>
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
              disabled={isEdoUser}
            >

              <SelectTrigger>
                <SelectValue placeholder="EDO Business" />
              </SelectTrigger>

              <SelectContent>

                {!isEdoUser && (
                  <SelectItem value="all">
                    All EDO Businesses
                  </SelectItem>
                )}

                {edoCompanies.map(
                  (company) => (
                    <SelectItem
                      key={company.id}
                      value={company.id}
                    >
                      {company.name}
                    </SelectItem>
                  )
                )}

              </SelectContent>

            </Select>

            {/* PEOPLE TYPE */}

            <Select
              value={peopleFilter}
              onValueChange={
                setPeopleFilter
              }
            >

              <SelectTrigger>
                <SelectValue placeholder="People Type" />
              </SelectTrigger>

              <SelectContent>

                <SelectItem value="all">
                  All People
                </SelectItem>

                <SelectItem value="employees">
                  Employees Only
                </SelectItem>

                <SelectItem value="edo">
                  EDOs Only
                </SelectItem>

              </SelectContent>

            </Select>

            {/* SITE */}

            <Select
              value={siteFilter}
              onValueChange={
                setSiteFilter
              }
            >

              <SelectTrigger>
                <SelectValue placeholder="Site" />
              </SelectTrigger>

              <SelectContent>

                <SelectItem value="all">
                  All Sites
                </SelectItem>

                {sites.map(
                  (site) => (
                    <SelectItem
                      key={site}
                      value={site}
                    >
                      {site}
                    </SelectItem>
                  )
                )}

              </SelectContent>

            </Select>

            {/* STATUS */}

            <Select
              value={statusFilter}
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

                <SelectItem value="employed">
                  Employed
                </SelectItem>

                <SelectItem value="terminated">
                  Terminated
                </SelectItem>

              </SelectContent>

            </Select>

            {/* CLEAR */}

            <Button
              variant="outline"
              onClick={clearFilters}
            >
              Clear Filters
            </Button>

          </div>

          {/* =================================================
              LOADING
          ================================================= */}

          {loading ? (

            <div className="flex h-48 items-center justify-center">

              <div className="flex items-center gap-3 text-muted-foreground">

                <Loader2 className="h-5 w-5 animate-spin" />

                Loading employees...

              </div>

            </div>

          ) : (

            /* =================================================
                TABLE
            ================================================= */

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
                      Occupation
                    </TableHead>

                    <TableHead>
                      Site
                    </TableHead>

                    <TableHead>
                      ID Number
                    </TableHead>

                    <TableHead>
                      Cellphone
                    </TableHead>

                    <TableHead>
                      Appointment Date
                    </TableHead>

                    <TableHead>
                      Status
                    </TableHead>

                    <TableHead className="w-[60px]" />

                  </TableRow>

                </TableHeader>

                <TableBody>

                  {filteredEmployees.map(
                    (employee) => (

                      <TableRow
                        key={employee.id}
                      >

                        {/* EMPLOYEE */}

                        <TableCell>

                          <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {employee.firstName}{" "}
                      {employee.surname}
                    </span>

                    {employee.workWeek === "5_day" && (
                      <Badge
                        variant="outline"
                        className="border-blue-300 bg-blue-50 px-1.5 py-0 text-[10px] font-medium text-blue-700"
                      >
                        5 Day
                      </Badge>
                    )}

                    {employee.workWeek === "6_day" && (
                      <Badge
                        variant="outline"
                        className="border-amber-300 bg-amber-50 px-1.5 py-0 text-[10px] font-medium text-amber-700"
                      >
                        6 Day
                      </Badge>
                    )}

                    {!employee.workWeek && !isEdo(employee) && (
                      <Badge
                        variant="outline"
                        className="border-red-300 bg-red-50 px-1.5 py-0 text-[10px] font-medium text-red-700"
                      >
                        Not Set
                      </Badge>
                    )}
                   </div>

                          <div className="text-xs text-muted-foreground">
                            {employee.employeeCode}
                          </div>

                        </TableCell>

                        {/* EDO BUSINESS */}

                        <TableCell>
                          {employee.edoName}
                        </TableCell>

                        {/* OCCUPATION */}

                        <TableCell>

                          <div className="flex items-center gap-2">

                            {employee.occupation ||
                              "—"}



                          </div>

                        </TableCell>

                        {/* SITE */}

                        <TableCell className="capitalize">
                          {employee.site ||
                            "—"}
                        </TableCell>

                        {/* ID */}

                        <TableCell>
                          {employee.idNumber ||
                            "—"}
                        </TableCell>

                        {/* CELLPHONE */}

                        <TableCell>
                          {employee.cellphone ||
                            "—"}
                        </TableCell>

                        {/* APPOINTMENT */}

                        <TableCell>
                          {employee.appointmentDate ||
                            "—"}
                        </TableCell>

                        {/* STATUS */}

                        <TableCell>

                          <Badge
                            variant={
                              isEmployed(
                                employee
                              )
                                ? "default"
                                : "secondary"
                            }
                            className="capitalize"
                          >
                            {employee.status ||
                              "—"}
                          </Badge>

                        </TableCell>

                        {/* ACTIONS */}

                        <TableCell>

                          <DropdownMenu>

                            <DropdownMenuTrigger
                              asChild
                            >

                              <Button
                                variant="ghost"
                                size="icon"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>

                            </DropdownMenuTrigger>

                            <DropdownMenuContent align="end">

                              <DropdownMenuItem>
                                View Employee
                              </DropdownMenuItem>

                              {canManageEmployees && (
                                <>
                                  <DropdownMenuItem
                                    onClick={() =>
                                      router.push(
                                        `/people/employee/${employee.id}/edit`
                                      )
                                    }
                                  >
                                    Edit Employee
                                  </DropdownMenuItem>

                                  <DropdownMenuItem>
                                    Change Cellphone
                                  </DropdownMenuItem>

                                  <DropdownMenuSeparator />
                                </>
                              )}

                              <DropdownMenuItem>
                                Attendance
                              </DropdownMenuItem>

                              <DropdownMenuItem>
                                Leave History
                              </DropdownMenuItem>

                              <DropdownMenuItem>
                                Payslips
                              </DropdownMenuItem>

                              {canManageEmployees && (
                                <>
                                  <DropdownMenuSeparator />

                                  <DropdownMenuItem className="text-destructive">
                                    Terminate Employee
                                  </DropdownMenuItem>
                                </>
                              )}

                            </DropdownMenuContent>

                          </DropdownMenu>

                        </TableCell>

                      </TableRow>

                    )
                  )}

                  {/* NO RESULTS */}

                  {filteredEmployees.length ===
                    0 && (

                    <TableRow>

                      <TableCell
                        colSpan={9}
                        className="h-24 text-center text-muted-foreground"
                      >
                        No employees found.
                      </TableCell>

                    </TableRow>

                  )}

                </TableBody>

              </Table>

            </div>

          )}

          {/* =================================================
              REGISTER TOTALS / COMPLIANCE FOOTER
          ================================================= */}

          {!loading && (

            <div className="mt-5 rounded-lg border bg-muted/20 p-4">

              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

                {/* COUNTS */}

                <div className="flex flex-wrap gap-x-8 gap-y-3">

                  <div>

                    <div className="text-xs text-muted-foreground">
                      Showing
                    </div>

                    <div className="text-xl font-bold">
                      {visiblePeopleCount}
                    </div>

                  </div>

                  <div>

                    <div className="text-xs text-muted-foreground">
                      Employees excluding EDO
                    </div>

                    <div className="text-xl font-bold">
                      {visibleNonEdoCount}
                    </div>

                  </div>

                  <div>

                    <div className="text-xs text-muted-foreground">
                      EDOs
                    </div>

                    <div className="text-xl font-bold">
                      {visibleEdoCount}
                    </div>

                  </div>

                </div>

                {/* SELECTED EDO COMPLIANCE */}

                {edoFilter !== "all" && (

                  <div
                    className={
                      selectedEdoIsCompliant
                        ? "flex items-center gap-3 rounded-md border border-green-500/30 bg-green-500/5 px-4 py-3"
                        : "flex items-center gap-3 rounded-md border border-red-500/30 bg-red-500/5 px-4 py-3"
                    }
                  >

                    {selectedEdoIsCompliant ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-red-600" />
                    )}

                    <div>

                      <div
                        className={
                          selectedEdoIsCompliant
                            ? "font-semibold text-green-700"
                            : "font-semibold text-red-700"
                        }
                      >
                        {selectedEdoIsCompliant
                          ? "Compliant"
                          : "Non-Compliant"}
                      </div>

                      <div className="text-xs text-muted-foreground">
                        {selectedEdoEmployeeCount} /{" "}
                        {MINIMUM_EMPLOYEES} employed
                        employees excluding EDO
                      </div>

                    </div>

                  </div>

                )}

              </div>

            </div>

          )}

        </CardContent>

      </Card>

    </div>
  );
}