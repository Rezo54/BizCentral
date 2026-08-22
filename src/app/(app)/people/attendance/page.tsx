//src/app/(app)/people/attendance/page.tsx
// BizCentral HR — Daily Attendance
// Taskraft can manage all EDOs. EDO users are locked to their own company through userAccess.
// Normal scheduled workdays default to Present. 5-day employees show Off on Saturday unless explicitly marked Present.
// Approved leave is derived from leaveRequests. Sunday work is explicitly confirmed in attendanceRecords.

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";

import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  Loader2,
  RefreshCw,
  Save,
  Search,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";

import {
  getAuth,
  onAuthStateChanged,
} from "firebase/auth";

import { db } from "@/lib/firebase";

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

type WorkWeek = "5_day" | "6_day" | "";

type Employee = {
  id: string;
  employeeCode: string;
  firstName: string;
  surname: string;
  edoId: string;
  edoName: string;
  site: string;
  occupation: string;
  appointmentDate: string;
  status: string;
  terminationDate?: string | null;
  workWeek: WorkWeek;
};

type EdoCompany = {
  id: string;
  name: string;
  site: string;
};

type UserAccess = {
  uid: string;
  name: string;
  email: string;
  userType: "taskraft" | "edo" | "reliever" | "";
  accessLevel: string;
  status: string;
  companyId: string | null;
};

type AttendanceException = {
  id: string;
  employeeId: string;
  reason: string;
  notes: string;
};

type AttendanceState = {
  status: "present" | "absent" | "off";
  reason: string;
  notes: string;
  originalStatus: "present" | "absent" | "off";
  originalReason: string;
  originalNotes: string;
};

type ApprovedLeave = {
  id: string;
  employeeId: string;
  edoId: string;
  fromDate: string;
  toDate: string;
  leaveType: string;
  notes: string;
};

type SundayWorkRecord = {
  id: string;
  employeeId: string;
  edoId: string;
  date: string;
  notes: string;
};

type SaturdayWorkRecord = {
  id: string;
  employeeId: string;
  edoId: string;
  date: string;
  notes: string;
};

type ExportException = {
  reason: string;
  notes: string;
};

type SummaryRecord = {
  edoId: string;
  edoName: string;
  site: string;
  employeeCode: string;
  firstName: string;
  surname: string;
  occupation: string;
  workWeek: WorkWeek;
  expected: number;
  present: number;
  absent: number;
  leave: number;
  sick: number;
  annualLeave: number;
  unpaidLeave: number;
  familyResponsibility: number;
  awol: number;
  other: number;
  sundayOvertime: number;
};

/* =========================================================
   HELPERS
========================================================= */

function getToday(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthStart(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

function isEdo(employee: Employee) {
  return employee.occupation.trim().toLowerCase() === "edo";
}

function workWeekLabel(employee: Employee) {
  return employee.workWeek === "6_day"
    ? "6 Day"
    : "5 Day";
}

function isEmployeeActiveOnDate(
  employee: Employee,
  selectedDate: string
) {
  if (
    employee.appointmentDate &&
    employee.appointmentDate > selectedDate
  ) {
    return false;
  }

  if (
    employee.terminationDate &&
    selectedDate > employee.terminationDate
  ) {
    return false;
  }

  const status =
    employee.status.trim().toLowerCase();

  return (
    status === "employed" ||
    status === "terminated"
  );
}

function getDayOfWeek(dateString: string) {
  return new Date(
    `${dateString}T12:00:00`
  ).getDay();
}

function isSunday(dateString: string) {
  return getDayOfWeek(dateString) === 0;
}

function isScheduledWorkday(
  employee: Employee,
  dateString: string
) {
  const day = getDayOfWeek(dateString);

  if (day === 0) {
    return false;
  }

  if (day === 6) {
    return employee.workWeek === "6_day";
  }

  return day >= 1 && day <= 5;
}

function createAttendanceExceptionId(
  employeeId: string,
  date: string
) {
  return `${employeeId}_${date}`;
}

function createSundayWorkId(
  employeeId: string,
  date: string
) {
  return `${employeeId}_${date}_sunday_work`;
}

function createSaturdayWorkId(employeeId: string, date: string) {
  return `${employeeId}_${date}_saturday_work`;
}

function isFiveDaySaturday(employee: Employee, dateString: string) {
  return getDayOfWeek(dateString) === 6 && employee.workWeek !== "6_day";
}

function getDatesBetween(
  startDate: string,
  endDate: string
): string[] {
  const dates: string[] = [];
  const current =
    new Date(`${startDate}T12:00:00`);
  const end =
    new Date(`${endDate}T12:00:00`);

  while (current <= end) {
    const year = current.getFullYear();
    const month = String(
      current.getMonth() + 1
    ).padStart(2, "0");
    const day = String(
      current.getDate()
    ).padStart(2, "0");

    dates.push(
      `${year}-${month}-${day}`
    );

    current.setDate(
      current.getDate() + 1
    );
  }

  return dates;
}

function formatExportDate(
  dateString: string
) {
  if (!dateString) return "";

  const [year, month, day] =
    dateString.split("-");

  return `${day}/${month}/${year}`;
}

function leaveTypeLabel(
  leaveType: string
) {
  const labels: Record<string, string> = {
    sick: "Sick Leave",
    sick_leave: "Sick Leave",
    annual: "Annual Leave",
    annual_leave: "Annual Leave",
    unpaid: "Unpaid Leave",
    unpaid_leave: "Unpaid Leave",
    family_responsibility:
      "Family Responsibility",
    family_responsibility_leave:
      "Family Responsibility",
    maternity: "Maternity Leave",
    parental: "Parental Leave",
    other: "Other Leave",
  };

  return (
    labels[
    leaveType
      .trim()
      .toLowerCase()
    ] ||
    leaveType ||
    "Approved Leave"
  );
}

function reasonLabel(reason: string) {
  const labels: Record<string, string> = {
    awol: "AWOL",
    other: "Other",
  };

  return (
    labels[reason] ||
    reason ||
    ""
  );
}

function approvedLeaveForDate(
  leaves: ApprovedLeave[],
  employeeId: string,
  date: string
) {
  return leaves.find(
    (leave) =>
      leave.employeeId ===
      employeeId &&
      leave.fromDate <= date &&
      leave.toDate >= date
  );
}

/* =========================================================
   PAGE
========================================================= */

export default function AttendancePage() {
  const router = useRouter();
  const auth = getAuth();

  /* =======================================================
     ACCESS
  ======================================================= */

  const [userAccess, setUserAccess] =
    useState<UserAccess | null>(null);

  const [authReady, setAuthReady] =
    useState(false);

  const isTaskraft =
    userAccess?.status === "approved" &&
    userAccess?.userType === "taskraft";

  const isEdoUser =
    userAccess?.status === "approved" &&
    userAccess?.userType === "edo" &&
    !!userAccess?.companyId;

  const lockedEdoId =
    isEdoUser
      ? userAccess?.companyId || ""
      : "";

  /* =======================================================
     DATA
  ======================================================= */

  const [companies, setCompanies] =
    useState<EdoCompany[]>([]);

  const [employees, setEmployees] =
    useState<Employee[]>([]);

  const [attendance, setAttendance] =
    useState<
      Record<string, AttendanceState>
    >({});

  const [approvedLeaves, setApprovedLeaves] =
    useState<ApprovedLeave[]>([]);

  const [
    sundayWorkRecords,
    setSundayWorkRecords,
  ] = useState<
    Record<string, SundayWorkRecord>
  >({});

  const [saturdayWorkRecords, setSaturdayWorkRecords] =
    useState<Record<string, SaturdayWorkRecord>>({});

  /* =======================================================
     DAILY REGISTER FILTERS
  ======================================================= */

  const [selectedDate, setSelectedDate] =
    useState(getToday());

  const [edoFilter, setEdoFilter] =
    useState("");

  const [search, setSearch] =
    useState("");

  /* =======================================================
     EXPORT
  ======================================================= */

  const [showExport, setShowExport] =
    useState(false);

  const [
    exportEdoFilter,
    setExportEdoFilter,
  ] = useState("all");

  const [exportFrom, setExportFrom] =
    useState(getMonthStart());

  const [exportTo, setExportTo] =
    useState(getToday());

  const [exporting, setExporting] =
    useState(false);

  /* =======================================================
     PAGE STATE
  ======================================================= */

  const [loading, setLoading] =
    useState(true);

  const [
    loadingAttendance,
    setLoadingAttendance,
  ] = useState(false);

  const [
    savingEmployeeId,
    setSavingEmployeeId,
  ] = useState<string | null>(null);

  const [
    savingSundayId,
    setSavingSundayId,
  ] = useState<string | null>(null);

  const [error, setError] =
    useState("");

  const [message, setMessage] =
    useState("");

  /* =======================================================
     CURRENT USER ACCESS
  ======================================================= */

  useEffect(() => {
    const unsubscribe =
      onAuthStateChanged(
        auth,
        async (firebaseUser) => {
          try {
            setError("");

            if (!firebaseUser) {
              setUserAccess(null);
              setAuthReady(true);
              router.push("/");
              return;
            }

            const accessSnapshot =
              await getDoc(
                doc(
                  db,
                  "userAccess",
                  firebaseUser.uid
                )
              );

            if (
              !accessSnapshot.exists()
            ) {
              setUserAccess(null);
              setError(
                "No user access record was found for this account."
              );
              setAuthReady(true);
              return;
            }

            const data =
              accessSnapshot.data();

            setUserAccess({
              uid:
                String(
                  data.uid ||
                  firebaseUser.uid
                ),

              name:
                String(
                  data.name || ""
                ),

              email:
                String(
                  data.email ||
                  firebaseUser.email ||
                  ""
                ),

              userType:
                String(
                  data.userType || ""
                )
                  .trim()
                  .toLowerCase() as UserAccess["userType"],

              accessLevel:
                String(
                  data.accessLevel || ""
                )
                  .trim()
                  .toLowerCase(),

              status:
                String(
                  data.status || ""
                )
                  .trim()
                  .toLowerCase(),

              companyId:
                data.companyId
                  ? String(
                    data.companyId
                  ).trim()
                  : null,
            });

          } catch (accessError) {
            console.error(
              "Unable to load user access:",
              accessError
            );

            setUserAccess(null);

            setError(
              "Unable to verify your BizCentral access."
            );

          } finally {
            setAuthReady(true);
          }
        }
      );

    return () => unsubscribe();

  }, [auth, router]);

  /* =======================================================
     LOAD COMPANIES + EMPLOYEES
  ======================================================= */

  async function loadMasterData(
    accessRecord: UserAccess
  ) {
    try {
      setLoading(true);
      setError("");

      const taskraftUser =
        accessRecord.status ===
        "approved" &&
        accessRecord.userType ===
        "taskraft";

      const edoUser =
        accessRecord.status ===
        "approved" &&
        accessRecord.userType ===
        "edo" &&
        !!accessRecord.companyId;

      if (
        !taskraftUser &&
        !edoUser
      ) {
        setCompanies([]);
        setEmployees([]);

        setError(
          "Your account does not have access to Attendance."
        );

        return;
      }

      const companySnapshot =
        await getDocs(
          collection(
            db,
            "companies"
          )
        );

      let companyData =
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
              company.type === "edo"
          )
          .sort((a, b) =>
            a.name.localeCompare(
              b.name
            )
          );

      if (edoUser) {
        companyData =
          companyData.filter(
            (company) =>
              company.id ===
              accessRecord.companyId
          );
      }

      setCompanies(companyData);

      const employeeSource =
        edoUser
          ? query(
            collection(
              db,
              "employees"
            ),
            where(
              "edoId",
              "==",
              accessRecord.companyId
            )
          )
          : collection(
            db,
            "employees"
          );

      const employeeSnapshot =
        await getDocs(
          employeeSource
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
                data.employeeCode ||
                "",

              firstName:
                data.firstName ||
                "",

              surname:
                data.surname || "",

              edoId:
                data.edoId || "",

              edoName:
                data.edoName || "",

              site:
                data.site || "",

              occupation:
                data.occupation ||
                "",

              appointmentDate:
                data.appointmentDate ||
                "",

              status:
                data.status || "",

              terminationDate:
                data.terminationDate ||
                null,

              workWeek:
                String(data.workWeek || "") as WorkWeek,
            };
          }
        );

      employeeData.sort(
        (a, b) => {
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

      setEmployees(employeeData);

      if (edoUser) {
        setEdoFilter(
          accessRecord.companyId ||
          ""
        );

        setExportEdoFilter(
          accessRecord.companyId ||
          ""
        );
      }

    } catch (loadError) {
      console.error(
        "Error loading attendance master data:",
        loadError
      );

      setError(
        "Unable to load employee attendance data."
      );

    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (
      !authReady ||
      !userAccess
    ) {
      return;
    }

    loadMasterData(
      userAccess
    );

  }, [
    authReady,
    userAccess?.uid,
    userAccess?.status,
    userAccess?.userType,
    userAccess?.companyId,
  ]);

  /* =======================================================
     SELECTED EDO
  ======================================================= */

  const selectedCompany =
    useMemo(() => {
      return companies.find(
        (company) =>
          company.id === edoFilter
      );
    }, [
      companies,
      edoFilter,
    ]);

  /* =======================================================
     ACTIVE EMPLOYEES FOR SELECTED EDO

     Sunday still shows active employees because they may
     be explicitly confirmed as Sunday overtime.
  ======================================================= */

  const activeEmployees =
    useMemo(() => {
      if (!edoFilter) {
        return [];
      }

      return employees.filter(
        (employee) => {
          if (
            employee.edoId !==
            edoFilter
          ) {
            return false;
          }

          if (isEdo(employee)) {
            return false;
          }

          return isEmployeeActiveOnDate(
            employee,
            selectedDate
          );
        }
      );

    }, [
      employees,
      edoFilter,
      selectedDate,
    ]);

  const scheduledEmployees =
    useMemo(() => {
      if (
        isSunday(
          selectedDate
        )
      ) {
        return [];
      }

      return activeEmployees.filter(
        (employee) =>
          isScheduledWorkday(
            employee,
            selectedDate
          )
      );

    }, [
      activeEmployees,
      selectedDate,
    ]);

  /* =======================================================
     LOAD DAILY ATTENDANCE + APPROVED LEAVE + SUNDAY WORK
  ======================================================= */

  async function loadDailyData() {
    if (
      !edoFilter ||
      !selectedDate
    ) {
      setAttendance({});
      setApprovedLeaves([]);
      setSundayWorkRecords({});
      return;
    }

    if (
      isEdoUser &&
      edoFilter !== lockedEdoId
    ) {
      setAttendance({});
      setApprovedLeaves([]);
      setSundayWorkRecords({});

      setError(
        "You can only view attendance for your own EDO business."
      );

      return;
    }

    try {
      setLoadingAttendance(true);
      setError("");
      setMessage("");

      const exceptionPromise =
        getDocs(
          query(
            collection(
              db,
              "attendanceExceptions"
            ),
            where(
              "edoId",
              "==",
              edoFilter
            ),
            where(
              "date",
              "==",
              selectedDate
            )
          )
        );

      const leavePromise =
        getDocs(
          query(
            collection(
              db,
              "leaveRequests"
            ),
            where(
              "edoId",
              "==",
              edoFilter
            ),
            where(
              "status",
              "==",
              "approved"
            )
          )
        );

      const sundayPromise =
        isSunday(selectedDate)
          ? getDocs(
            query(
              collection(
                db,
                "attendanceRecords"
              ),
              where(
                "edoId",
                "==",
                edoFilter
              ),
              where(
                "date",
                "==",
                selectedDate
              ),
              where(
                "recordType",
                "==",
                "sunday_work"
              )
            )
          )
          : Promise.resolve(null);

      const saturdayPromise = getDayOfWeek(selectedDate) === 6
        ? getDocs(query(
          collection(db, "attendanceRecords"),
          where("edoId", "==", edoFilter),
          where("date", "==", selectedDate),
          where("recordType", "==", "saturday_work")
        ))
        : Promise.resolve(null);

      const [
        exceptionSnapshot,
        leaveSnapshot,
        sundaySnapshot,
        saturdaySnapshot,
      ] = await Promise.all([
        exceptionPromise,
        leavePromise,
        sundayPromise,
        saturdayPromise,
      ]);

      const exceptionMap =
        new Map<
          string,
          AttendanceException
        >();

      exceptionSnapshot.docs.forEach(
        (exceptionDoc) => {
          const data =
            exceptionDoc.data();

          exceptionMap.set(
            String(
              data.employeeId || ""
            ),
            {
              id:
                data.id ||
                exceptionDoc.id,

              employeeId:
                data.employeeId ||
                "",

              reason:
                data.reason || "",

              notes:
                data.notes || "",
            }
          );
        }
      );

      const leaveData:
        ApprovedLeave[] =
        leaveSnapshot.docs
          .map((leaveDoc) => {
            const data =
              leaveDoc.data();

            return {
              id:
                data.id ||
                leaveDoc.id,

              employeeId:
                String(
                  data.employeeId ||
                  ""
                ),

              edoId:
                String(
                  data.edoId || ""
                ),

              fromDate:
                String(
                  data.fromDate || ""
                ),

              toDate:
                String(
                  data.toDate || ""
                ),

              leaveType:
                String(
                  data.leaveType ||
                  data.type ||
                  ""
                ),

              notes:
                String(
                  data.notes ||
                  data.reason ||
                  ""
                ),
            };
          })
          .filter(
            (leave) =>
              leave.employeeId &&
              leave.fromDate &&
              leave.toDate &&
              leave.fromDate <=
              selectedDate &&
              leave.toDate >=
              selectedDate
          );

      setApprovedLeaves(
        leaveData
      );

      const sundayMap:
        Record<
          string,
          SundayWorkRecord
        > = {};

      if (sundaySnapshot) {
        sundaySnapshot.docs.forEach(
          (recordDoc) => {
            const data =
              recordDoc.data();

            const employeeId =
              String(
                data.employeeId ||
                ""
              );

            if (!employeeId) {
              return;
            }

            sundayMap[
              employeeId
            ] = {
              id:
                data.id ||
                recordDoc.id,

              employeeId,

              edoId:
                String(
                  data.edoId || ""
                ),

              date:
                String(
                  data.date || ""
                ),

              notes:
                String(
                  data.notes || ""
                ),
            };
          }
        );
      }

      setSundayWorkRecords(
        sundayMap
      );

      const saturdayMap: Record<string, SaturdayWorkRecord> = {};
      if (saturdaySnapshot) {
        saturdaySnapshot.docs.forEach((recordDoc) => {
          const data = recordDoc.data();
          const employeeId = String(data.employeeId || "");
          if (!employeeId) return;
          saturdayMap[employeeId] = { id: data.id || recordDoc.id, employeeId, edoId: String(data.edoId || ""), date: String(data.date || ""), notes: String(data.notes || "") };
        });
      }
      setSaturdayWorkRecords(saturdayMap);

      const state:
        Record<
          string,
          AttendanceState
        > = {};

      activeEmployees.forEach(
        (employee) => {
          const exception =
            exceptionMap.get(
              employee.id
            );

          if (isFiveDaySaturday(employee, selectedDate)) {
            const worked = !!saturdayMap[employee.id];
            state[employee.id] = { status: worked ? "present" : "off", reason: "", notes: "", originalStatus: worked ? "present" : "off", originalReason: "", originalNotes: "" };
          } else if (exception) {
            state[employee.id] = {
              status: "absent",
              reason:
                exception.reason ||
                "",
              notes:
                exception.notes ||
                "",
              originalStatus:
                "absent",
              originalReason:
                exception.reason ||
                "",
              originalNotes:
                exception.notes ||
                "",
            };
          } else {
            state[employee.id] = {
              status: "present",
              reason: "",
              notes: "",
              originalStatus:
                "present",
              originalReason: "",
              originalNotes: "",
            };
          }
        }
      );

      setAttendance(state);

    } catch (dailyError) {
      console.error(
        "Error loading attendance data:",
        dailyError
      );

      setError(
        "Unable to load attendance, leave or Sunday work records."
      );

    } finally {
      setLoadingAttendance(false);
    }
  }

  useEffect(() => {
    loadDailyData();

  }, [
    edoFilter,
    selectedDate,
    scheduledEmployees.length,
    activeEmployees.length,
  ]);

  /* =======================================================
     SEARCH
  ======================================================= */

  const visibleEmployees =
    useMemo(() => {
      const source = activeEmployees;

      const searchText =
        search
          .trim()
          .toLowerCase();

      if (!searchText) {
        return source;
      }

      return source.filter(
        (employee) => {
          const text = [
            employee.employeeCode,
            employee.firstName,
            employee.surname,
            employee.occupation,
            workWeekLabel(employee),
          ]
            .join(" ")
            .toLowerCase();

          return text.includes(
            searchText
          );
        }
      );

    }, [
      activeEmployees,
      scheduledEmployees,
      selectedDate,
      search,
    ]);

  /* =======================================================
     DAILY STATUS HELPERS
  ======================================================= */

  function employeeLeave(
    employee: Employee
  ) {
    if (
      !isScheduledWorkday(
        employee,
        selectedDate
      )
    ) {
      return undefined;
    }

    return approvedLeaveForDate(
      approvedLeaves,
      employee.id,
      selectedDate
    );
  }

  const totalExpected =
    isSunday(selectedDate)
      ? Object.keys(
        sundayWorkRecords
      ).length
      : scheduledEmployees.length;

  const leaveCount =
    isSunday(selectedDate)
      ? 0
      : scheduledEmployees.filter(
        (employee) =>
          !!employeeLeave(
            employee
          )
      ).length;

  const absentCount =
    isSunday(selectedDate)
      ? 0
      : scheduledEmployees.filter(
        (employee) =>
          !employeeLeave(
            employee
          ) &&
          attendance[
            employee.id
          ]?.status ===
          "absent"
      ).length;

  const presentCount =
    isSunday(selectedDate)
      ? Object.keys(
        sundayWorkRecords
      ).length
      : Math.max(
        0,
        totalExpected -
        leaveCount -
        absentCount
      );

  const offCount = isSunday(selectedDate) ? 0 : activeEmployees.filter((employee) => attendance[employee.id]?.status === "off").length;
  const displayedPresentCount = presentCount + (getDayOfWeek(selectedDate) === 6 ? Object.keys(saturdayWorkRecords).length : 0);

  /* =======================================================
     UPDATE LOCAL ATTENDANCE
  ======================================================= */

  function updateAttendance(
    employeeId: string,
    field:
      | "status"
      | "reason"
      | "notes",
    value: string
  ) {
    setAttendance(
      (current) => ({
        ...current,

        [employeeId]: {
          ...current[
          employeeId
          ],

          [field]: value,

          ...(field ===
            "status" &&
            value ===
            "present"
            ? {
              reason: "",
              notes: "",
            }
            : {}),
        },
      })
    );
  }

  function hasChanged(
    employeeId: string
  ) {
    const state =
      attendance[
      employeeId
      ];

    if (!state) {
      return false;
    }

    return (
      state.status !==
      state.originalStatus ||
      state.reason !==
      state.originalReason ||
      state.notes !==
      state.originalNotes
    );
  }

  /* =======================================================
     SAVE ATTENDANCE EXCEPTION
  ======================================================= */

  async function saveEmployee(
    employee: Employee
  ) {
    if (selectedDate > getToday()) {
      alert("Attendance cannot be recorded for a future date.");
      return;
    }

    if (
      isEdoUser &&
      employee.edoId !==
      lockedEdoId
    ) {
      setError(
        "You can only update attendance for employees in your own EDO business."
      );
      return;
    }

    if (
      employeeLeave(
        employee
      )
    ) {
      return;
    }

    const state =
      attendance[
      employee.id
      ];

    if (!state) {
      return;
    }

    if (
      state.status ===
      "absent" &&
      !state.reason
    ) {
      alert(
        `Please select an absence reason for ${employee.firstName} ${employee.surname}.`
      );
      return;
    }

    if (isFiveDaySaturday(employee, selectedDate)) {
      try {
        setSavingEmployeeId(employee.id);
        const recordId = createSaturdayWorkId(employee.id, selectedDate);
        const recordRef = doc(db, "attendanceRecords", recordId);
        if (state.status === "present") {
          const record: SaturdayWorkRecord = { id: recordId, employeeId: employee.id, edoId: employee.edoId, date: selectedDate, notes: "" };
          await setDoc(recordRef, { ...record, employeeCode: employee.employeeCode, employeeName: `${employee.firstName} ${employee.surname}`.trim(), edoName: employee.edoName, site: employee.site, workWeek: employee.workWeek, recordType: "saturday_work", status: "worked", recordedBy: userAccess?.uid || "", recordedByName: userAccess?.name || userAccess?.email || "", updatedAt: serverTimestamp() }, { merge: true });
          setSaturdayWorkRecords((current) => ({ ...current, [employee.id]: record }));
        } else {
          await deleteDoc(recordRef);
          setSaturdayWorkRecords((current) => { const next = { ...current }; delete next[employee.id]; return next; });
        }
        setAttendance((current) => ({ ...current, [employee.id]: { ...current[employee.id], originalStatus: state.status, originalReason: "", originalNotes: "" } }));
        setMessage(`${employee.firstName} ${employee.surname} Saturday attendance updated.`);
      } catch (saveError) {
        console.error("Error saving Saturday attendance:", saveError);
        setError("Saturday attendance could not be saved.");
      } finally { setSavingEmployeeId(null); }
      return;
    }

    try {
      setSavingEmployeeId(
        employee.id
      );

      setError("");
      setMessage("");

      const exceptionId =
        createAttendanceExceptionId(
          employee.id,
          selectedDate
        );

      const exceptionRef =
        doc(
          db,
          "attendanceExceptions",
          exceptionId
        );

      if (
        state.status ===
        "absent"
      ) {
        await setDoc(
          exceptionRef,
          {
            id:
              exceptionId,

            employeeId:
              employee.id,

            employeeCode:
              employee.employeeCode,

            employeeName:
              `${employee.firstName} ${employee.surname}`.trim(),

            edoId:
              employee.edoId,

            edoName:
              employee.edoName,

            site:
              employee.site,

            date:
              selectedDate,

            status:
              "absent",

            reason:
              state.reason,

            notes:
              state.notes.trim(),

            recordedBy:
              userAccess?.uid ||
              "",

            recordedByName:
              userAccess?.name ||
              userAccess?.email ||
              "",

            updatedAt:
              serverTimestamp(),
          },
          {
            merge: true,
          }
        );
      } else {
        await deleteDoc(
          exceptionRef
        );
      }

      setAttendance(
        (current) => ({
          ...current,

          [employee.id]: {
            ...current[
            employee.id
            ],

            originalStatus:
              state.status,

            originalReason:
              state.reason,

            originalNotes:
              state.notes,
          },
        })
      );

      setMessage(
        `${employee.firstName} ${employee.surname}'s attendance was updated.`
      );

    } catch (saveError) {
      console.error(
        "Error saving attendance:",
        saveError
      );

      setError(
        "Attendance could not be saved. Check the browser console for details."
      );

    } finally {
      setSavingEmployeeId(
        null
      );
    }
  }

  /* =======================================================
     SUNDAY OVERTIME

     No record = did not work Sunday.
     Record exists = Sunday work confirmed / overtime.
  ======================================================= */

  async function toggleSundayWork(
    employee: Employee
  ) {
    if (selectedDate > getToday()) {
      alert("Sunday overtime cannot be recorded for a future date.");
      return;
    }

    if (
      !isSunday(
        selectedDate
      )
    ) {
      return;
    }

    if (
      isEdoUser &&
      employee.edoId !==
      lockedEdoId
    ) {
      setError(
        "You can only confirm Sunday work for employees in your own EDO business."
      );
      return;
    }

    const existing =
      sundayWorkRecords[
      employee.id
      ];

    if (
      existing &&
      !window.confirm(
        `Remove Sunday overtime confirmation for ${employee.firstName} ${employee.surname}?`
      )
    ) {
      return;
    }

    try {
      setSavingSundayId(
        employee.id
      );

      setError("");
      setMessage("");

      const recordId =
        createSundayWorkId(
          employee.id,
          selectedDate
        );

      const recordRef =
        doc(
          db,
          "attendanceRecords",
          recordId
        );

      if (existing) {
        await deleteDoc(
          recordRef
        );

        setSundayWorkRecords(
          (current) => {
            const next = {
              ...current,
            };

            delete next[
              employee.id
            ];

            return next;
          }
        );

        setMessage(
          `Sunday overtime removed for ${employee.firstName} ${employee.surname}.`
        );

      } else {
        const record: SundayWorkRecord =
        {
          id:
            recordId,

          employeeId:
            employee.id,

          edoId:
            employee.edoId,

          date:
            selectedDate,

          notes: "",
        };

        await setDoc(
          recordRef,
          {
            ...record,

            employeeCode:
              employee.employeeCode,

            employeeName:
              `${employee.firstName} ${employee.surname}`.trim(),

            edoName:
              employee.edoName,

            site:
              employee.site,

            workWeek:
              employee.workWeek,

            recordType:
              "sunday_work",

            status:
              "worked",

            overtime:
              true,

            recordedBy:
              userAccess?.uid ||
              "",

            recordedByName:
              userAccess?.name ||
              userAccess?.email ||
              "",

            createdAt:
              serverTimestamp(),

            updatedAt:
              serverTimestamp(),
          },
          {
            merge: true,
          }
        );

        setSundayWorkRecords(
          (current) => ({
            ...current,
            [employee.id]:
              record,
          })
        );

        setMessage(
          `Sunday overtime confirmed for ${employee.firstName} ${employee.surname}.`
        );
      }

    } catch (sundayError) {
      console.error(
        "Error updating Sunday work:",
        sundayError
      );

      setError(
        "Sunday overtime could not be updated. Check the browser console for details."
      );

    } finally {
      setSavingSundayId(
        null
      );
    }
  }

  /* =======================================================
     DOWNLOAD ATTENDANCE
  ======================================================= */

  async function downloadAttendance() {
    const effectiveEdoFilter =
      isEdoUser
        ? lockedEdoId
        : exportEdoFilter;

    if (
      !effectiveEdoFilter
    ) {
      alert(
        "Please select an EDO business or All EDOs."
      );
      return;
    }

    if (
      isEdoUser &&
      effectiveEdoFilter !==
      lockedEdoId
    ) {
      alert(
        "You can only download attendance for your own EDO business."
      );
      return;
    }

    if (
      !exportFrom ||
      !exportTo
    ) {
      alert(
        "Please select both From and To dates."
      );
      return;
    }

    if (
      exportFrom > getToday() ||
      exportTo > getToday()
    ) {
      alert(
        "Attendance registers cannot include future dates."
      );
      return;
    }

    if (
      exportFrom >
      exportTo
    ) {
      alert(
        "The From date cannot be after the To date."
      );
      return;
    }

    const exportingAll =
      isTaskraft &&
      effectiveEdoFilter ===
      "all";

    const exportCompany =
      exportingAll
        ? null
        : companies.find(
          (company) =>
            company.id ===
            effectiveEdoFilter
        );

    if (
      !exportingAll &&
      !exportCompany
    ) {
      alert(
        "EDO business could not be found."
      );
      return;
    }

    try {
      setExporting(true);
      setError("");

      const dates =
        getDatesBetween(
          exportFrom,
          exportTo
        );

      /* ---------------------------------------------------
         ATTENDANCE EXCEPTIONS
      --------------------------------------------------- */

      const exceptionSnapshot =
        exportingAll
          ? await getDocs(
            collection(
              db,
              "attendanceExceptions"
            )
          )
          : await getDocs(
            query(
              collection(
                db,
                "attendanceExceptions"
              ),
              where(
                "edoId",
                "==",
                effectiveEdoFilter
              )
            )
          );

      const exceptionMap =
        new Map<
          string,
          ExportException
        >();

      exceptionSnapshot.docs.forEach(
        (exceptionDoc) => {
          const data =
            exceptionDoc.data();

          const date =
            String(
              data.date || ""
            );

          if (
            !date ||
            date < exportFrom ||
            date > exportTo
          ) {
            return;
          }

          const employeeId =
            String(
              data.employeeId ||
              ""
            );

          if (!employeeId) {
            return;
          }

          exceptionMap.set(
            `${employeeId}_${date}`,
            {
              reason:
                data.reason || "",
              notes:
                data.notes || "",
            }
          );
        }
      );

      /* ---------------------------------------------------
         APPROVED LEAVE
      --------------------------------------------------- */

      const leaveSnapshot =
        exportingAll
          ? await getDocs(
            query(
              collection(
                db,
                "leaveRequests"
              ),
              where(
                "status",
                "==",
                "approved"
              )
            )
          )
          : await getDocs(
            query(
              collection(
                db,
                "leaveRequests"
              ),
              where(
                "edoId",
                "==",
                effectiveEdoFilter
              ),
              where(
                "status",
                "==",
                "approved"
              )
            )
          );

      const exportLeaves:
        ApprovedLeave[] =
        leaveSnapshot.docs
          .map((leaveDoc) => {
            const data =
              leaveDoc.data();

            return {
              id:
                data.id ||
                leaveDoc.id,

              employeeId:
                String(
                  data.employeeId ||
                  ""
                ),

              edoId:
                String(
                  data.edoId || ""
                ),

              fromDate:
                String(
                  data.fromDate || ""
                ),

              toDate:
                String(
                  data.toDate || ""
                ),

              leaveType:
                String(
                  data.leaveType ||
                  data.type ||
                  ""
                ),

              notes:
                String(
                  data.notes ||
                  data.reason ||
                  ""
                ),
            };
          })
          .filter(
            (leave) =>
              leave.employeeId &&
              leave.fromDate <=
              exportTo &&
              leave.toDate >=
              exportFrom
          );

      /* ---------------------------------------------------
         SUNDAY OVERTIME
      --------------------------------------------------- */

      const sundaySnapshot =
        exportingAll
          ? await getDocs(
            query(
              collection(
                db,
                "attendanceRecords"
              ),
              where(
                "recordType",
                "==",
                "sunday_work"
              )
            )
          )
          : await getDocs(
            query(
              collection(
                db,
                "attendanceRecords"
              ),
              where(
                "edoId",
                "==",
                effectiveEdoFilter
              ),
              where(
                "recordType",
                "==",
                "sunday_work"
              )
            )
          );

      const sundayMap =
        new Map<
          string,
          SundayWorkRecord
        >();

      sundaySnapshot.docs.forEach(
        (recordDoc) => {
          const data =
            recordDoc.data();

          const date =
            String(
              data.date || ""
            );

          if (
            !date ||
            date < exportFrom ||
            date > exportTo
          ) {
            return;
          }

          const employeeId =
            String(
              data.employeeId ||
              ""
            );

          if (!employeeId) {
            return;
          }

          sundayMap.set(
            `${employeeId}_${date}`,
            {
              id:
                data.id ||
                recordDoc.id,

              employeeId,

              edoId:
                String(
                  data.edoId || ""
                ),

              date,

              notes:
                String(
                  data.notes || ""
                ),
            }
          );
        }
      );

      /* ---------------------------------------------------
         EMPLOYEES FOR REPORT
      --------------------------------------------------- */

      const reportEmployees =
        employees.filter(
          (employee) => {
            if (
              isEdo(employee)
            ) {
              return false;
            }

            if (exportingAll) {
              return true;
            }

            return (
              employee.edoId ===
              effectiveEdoFilter
            );
          }
        );

      /* ---------------------------------------------------
         REGISTER + SUMMARY
      --------------------------------------------------- */

      const registerRows:
        Record<
          string,
          string | number
        >[] = [];

      const summaryMap =
        new Map<
          string,
          SummaryRecord
        >();

      function getSummary(
        employee: Employee
      ) {
        let summary =
          summaryMap.get(
            employee.id
          );

        if (!summary) {
          summary = {
            edoId:
              employee.edoId,

            edoName:
              employee.edoName,

            site:
              employee.site,

            employeeCode:
              employee.employeeCode,

            firstName:
              employee.firstName,

            surname:
              employee.surname,

            occupation:
              employee.occupation,

            workWeek:
              employee.workWeek,

            expected: 0,
            present: 0,
            absent: 0,
            leave: 0,
            sick: 0,
            annualLeave: 0,
            unpaidLeave: 0,
            familyResponsibility: 0,
            awol: 0,
            other: 0,
            sundayOvertime: 0,
          };

          summaryMap.set(
            employee.id,
            summary
          );
        }

        return summary;
      }

      dates.forEach(
        (date) => {
          reportEmployees.forEach(
            (employee) => {
              if (
                !isEmployeeActiveOnDate(
                  employee,
                  date
                )
              ) {
                return;
              }

              const summary =
                getSummary(
                  employee
                );

              const key =
                `${employee.id}_${date}`;

              /* -------------------------------------------
                 SUNDAY
              ------------------------------------------- */

              if (
                isSunday(date)
              ) {
                const sundayRecord =
                  sundayMap.get(
                    key
                  );

                if (
                  !sundayRecord
                ) {
                  return;
                }

                summary.sundayOvertime++;

                registerRows.push({
                  Date:
                    formatExportDate(
                      date
                    ),

                  "EDO Business":
                    employee.edoName,

                  Site:
                    employee.site,

                  "Employee Code":
                    employee.employeeCode,

                  "First Name":
                    employee.firstName,

                  Surname:
                    employee.surname,

                  Occupation:
                    employee.occupation,

                  "Work Week":
                    workWeekLabel(
                      employee
                    ),

                  Status:
                    "Worked - Sunday",

                  Reason:
                    "Sunday Overtime",

                  Overtime:
                    "Yes",

                  Notes:
                    sundayRecord.notes ||
                    "",
                });

                return;
              }

              /* -------------------------------------------
                 NON-SCHEDULED DAY
              ------------------------------------------- */

              if (
                !isScheduledWorkday(
                  employee,
                  date
                )
              ) {
                return;
              }

              summary.expected++;

              const leave =
                approvedLeaveForDate(
                  exportLeaves,
                  employee.id,
                  date
                );

              if (leave) {
                summary.leave++;

                const leaveType =
                  leave.leaveType
                    .trim()
                    .toLowerCase();

                if (
                  leaveType.includes(
                    "sick"
                  )
                ) {
                  summary.sick++;
                } else if (
                  leaveType.includes(
                    "annual"
                  )
                ) {
                  summary.annualLeave++;
                } else if (
                  leaveType.includes(
                    "unpaid"
                  )
                ) {
                  summary.unpaidLeave++;
                } else if (
                  leaveType.includes(
                    "family"
                  )
                ) {
                  summary.familyResponsibility++;
                } else {
                  summary.other++;
                }

                registerRows.push({
                  Date:
                    formatExportDate(
                      date
                    ),

                  "EDO Business":
                    employee.edoName,

                  Site:
                    employee.site,

                  "Employee Code":
                    employee.employeeCode,

                  "First Name":
                    employee.firstName,

                  Surname:
                    employee.surname,

                  Occupation:
                    employee.occupation,

                  "Work Week":
                    workWeekLabel(
                      employee
                    ),

                  Status:
                    "Leave",

                  Reason:
                    leaveTypeLabel(
                      leave.leaveType
                    ),

                  Overtime:
                    "No",

                  Notes:
                    leave.notes ||
                    "",
                });

                return;
              }

              const exception =
                exceptionMap.get(
                  key
                );

              if (exception) {
                summary.absent++;

                if (
                  exception.reason ===
                  "awol"
                ) {
                  summary.awol++;
                } else {
                  summary.other++;
                }

                registerRows.push({
                  Date:
                    formatExportDate(
                      date
                    ),

                  "EDO Business":
                    employee.edoName,

                  Site:
                    employee.site,

                  "Employee Code":
                    employee.employeeCode,

                  "First Name":
                    employee.firstName,

                  Surname:
                    employee.surname,

                  Occupation:
                    employee.occupation,

                  "Work Week":
                    workWeekLabel(
                      employee
                    ),

                  Status:
                    "Absent",

                  Reason:
                    reasonLabel(
                      exception.reason
                    ),

                  Overtime:
                    "No",

                  Notes:
                    exception.notes ||
                    "",
                });

                return;
              }

              summary.present++;

              registerRows.push({
                Date:
                  formatExportDate(
                    date
                  ),

                "EDO Business":
                  employee.edoName,

                Site:
                  employee.site,

                "Employee Code":
                  employee.employeeCode,

                "First Name":
                  employee.firstName,

                Surname:
                  employee.surname,

                Occupation:
                  employee.occupation,

                "Work Week":
                  workWeekLabel(
                    employee
                  ),

                Status:
                  "Present",

                Reason: "",

                Overtime:
                  "No",

                Notes: "",
              });
            }
          );
        }
      );

      if (
        registerRows.length ===
        0
      ) {
        alert(
          "No attendance records were found for the selected reporting period."
        );
        return;
      }

      registerRows.sort(
        (a, b) => {
          const edoCompare =
            String(
              a[
              "EDO Business"
              ]
            ).localeCompare(
              String(
                b[
                "EDO Business"
                ]
              )
            );

          if (
            edoCompare !== 0
          ) {
            return edoCompare;
          }

          const dateCompare =
            String(
              a.Date
            ).localeCompare(
              String(
                b.Date
              )
            );

          if (
            dateCompare !== 0
          ) {
            return dateCompare;
          }

          return String(
            a.Surname
          ).localeCompare(
            String(
              b.Surname
            )
          );
        }
      );

      /* ---------------------------------------------------
         EMPLOYEE SUMMARY
      --------------------------------------------------- */

      const summaryRows =
        Array.from(
          summaryMap.values()
        )
          .filter(
            (summary) =>
              summary.expected > 0 ||
              summary.sundayOvertime >
              0
          )
          .sort((a, b) => {
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

            return a.firstName.localeCompare(
              b.firstName
            );
          })
          .map(
            (summary) => {
              const attendanceBase =
                Math.max(
                  0,
                  summary.expected -
                  summary.leave
                );

              const percentage =
                attendanceBase > 0
                  ? (
                    (
                      summary.present /
                      attendanceBase
                    ) *
                    100
                  ).toFixed(1)
                  : "0.0";

              return {
                "EDO Business":
                  summary.edoName,

                Site:
                  summary.site,

                "Employee Code":
                  summary.employeeCode,

                "First Name":
                  summary.firstName,

                Surname:
                  summary.surname,

                Occupation:
                  summary.occupation,

                "Work Week":
                  summary.workWeek ===
                    "6_day"
                    ? "6 Day"
                    : "5 Day",

                "Scheduled Days":
                  summary.expected,

                Present:
                  summary.present,

                Leave:
                  summary.leave,

                Absent:
                  summary.absent,

                "Sick Leave":
                  summary.sick,

                "Annual Leave":
                  summary.annualLeave,

                "Unpaid Leave":
                  summary.unpaidLeave,

                "Family Responsibility":
                  summary.familyResponsibility,

                AWOL:
                  summary.awol,

                Other:
                  summary.other,

                "Sunday Overtime":
                  summary.sundayOvertime,

                "Attendance %":
                  `${percentage}%`,
              };
            }
          );

      /* ---------------------------------------------------
         EDO SUMMARY
      --------------------------------------------------- */

      const companiesForSummary =
        exportingAll
          ? companies
          : companies.filter(
            (company) =>
              company.id ===
              effectiveEdoFilter
          );

      const edoSummaryRows =
        companiesForSummary.map(
          (company) => {
            const companyEmployees =
              Array.from(
                summaryMap.values()
              ).filter(
                (summary) =>
                  summary.edoId ===
                  company.id
              );

            const expected =
              companyEmployees.reduce(
                (total, employee) =>
                  total +
                  employee.expected,
                0
              );

            const present =
              companyEmployees.reduce(
                (total, employee) =>
                  total +
                  employee.present,
                0
              );

            const absent =
              companyEmployees.reduce(
                (total, employee) =>
                  total +
                  employee.absent,
                0
              );

            const leave =
              companyEmployees.reduce(
                (total, employee) =>
                  total +
                  employee.leave,
                0
              );

            const sundayOvertime =
              companyEmployees.reduce(
                (total, employee) =>
                  total +
                  employee.sundayOvertime,
                0
              );

            const attendanceBase =
              Math.max(
                0,
                expected - leave
              );

            const percentage =
              attendanceBase > 0
                ? (
                  (
                    present /
                    attendanceBase
                  ) *
                  100
                ).toFixed(1)
                : "0.0";

            return {
              "EDO Business":
                company.name,

              Site:
                company.site,

              Employees:
                companyEmployees.length,

              "Scheduled Attendance":
                expected,

              Present:
                present,

              Leave:
                leave,

              Absent:
                absent,

              "Sunday Overtime":
                sundayOvertime,

              "Attendance %":
                `${percentage}%`,
            };
          }
        );

      /* ---------------------------------------------------
         CREATE WORKBOOK
      --------------------------------------------------- */

      const workbook =
        XLSX.utils.book_new();

      const registerSheet =
        XLSX.utils.json_to_sheet(
          registerRows
        );

      const summarySheet =
        XLSX.utils.json_to_sheet(
          summaryRows
        );

      const edoSummarySheet =
        XLSX.utils.json_to_sheet(
          edoSummaryRows
        );

      registerSheet["!cols"] = [
        { wch: 14 },
        { wch: 35 },
        { wch: 16 },
        { wch: 18 },
        { wch: 20 },
        { wch: 20 },
        { wch: 24 },
        { wch: 12 },
        { wch: 20 },
        { wch: 24 },
        { wch: 12 },
        { wch: 40 },
      ];

      summarySheet["!cols"] = [
        { wch: 35 },
        { wch: 16 },
        { wch: 18 },
        { wch: 20 },
        { wch: 20 },
        { wch: 24 },
        { wch: 12 },
        { wch: 16 },
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
        { wch: 16 },
        { wch: 18 },
        { wch: 18 },
        { wch: 24 },
        { wch: 12 },
        { wch: 12 },
        { wch: 18 },
        { wch: 16 },
      ];

      edoSummarySheet["!cols"] = [
        { wch: 35 },
        { wch: 16 },
        { wch: 14 },
        { wch: 22 },
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
        { wch: 18 },
        { wch: 16 },
      ];

      if (exportingAll) {
        XLSX.utils.book_append_sheet(
          workbook,
          edoSummarySheet,
          "EDO Summary"
        );
      }

      XLSX.utils.book_append_sheet(
        workbook,
        registerSheet,
        "Attendance Register"
      );

      XLSX.utils.book_append_sheet(
        workbook,
        summarySheet,
        "Employee Summary"
      );

      /* ---------------------------------------------------
         FILE NAME
      --------------------------------------------------- */

      let fileName: string;

      if (exportingAll) {
        fileName =
          `Attendance_ALL_EDOs_${exportFrom}_to_${exportTo}.xlsx`;
      } else {
        const safeCompanyName =
          exportCompany!.name
            .replace(
              /[^a-z0-9]+/gi,
              "_"
            )
            .replace(
              /^_+|_+$/g,
              ""
            );

        fileName =
          `Attendance_${safeCompanyName}_${exportFrom}_to_${exportTo}.xlsx`;
      }

      XLSX.writeFile(
        workbook,
        fileName
      );

      setShowExport(false);

      setMessage(
        exportingAll
          ? "Attendance register downloaded for all EDO businesses."
          : `Attendance register downloaded for ${exportCompany!.name}.`
      );

    } catch (exportError) {
      console.error(
        "Attendance export failed:",
        exportError
      );

      setError(
        "Attendance export failed. Check the browser console for details."
      );

    } finally {
      setExporting(false);
    }
  }

  /* =======================================================
     PAGE
  ======================================================= */

  if (!authReady) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Verifying access...
        </div>
      </div>
    );
  }

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
              Daily Attendance
            </h1>

            <p className="text-muted-foreground">
              Scheduled employees are present by default. 5-day employees default to Off on Saturday and can be marked Present when they work. Approved leave is automatic and Sunday work must be confirmed.
            </p>

          </div>

        </div>

        <div className="flex flex-wrap gap-2">

          <Button
            variant="outline"
            onClick={() => {
              if (!showExport) {
                setExportEdoFilter(
                  isEdoUser
                    ? lockedEdoId
                    : edoFilter ||
                    "all"
                );
              }

              setShowExport(
                (current) =>
                  !current
              );
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            Download Attendance
          </Button>

          <Button
            variant="outline"
            onClick={() => {
              if (userAccess) {
                loadMasterData(
                  userAccess
                );
              }

              loadDailyData();
            }}
            disabled={
              loading ||
              loadingAttendance
            }
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${loading ||
                loadingAttendance
                ? "animate-spin"
                : ""
                }`}
            />
            Refresh
          </Button>

        </div>

      </div>

      {/* ===================================================
          EXPORT OPTIONS
      =================================================== */}

      {showExport && (

        <Card className="border-blue-500/30">

          <CardHeader>

            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Download Attendance Register
            </CardTitle>

            <CardDescription>
              {isEdoUser
                ? "Download attendance for your EDO business."
                : "Download attendance for one EDO business or the complete EDO programme."}
            </CardDescription>

          </CardHeader>

          <CardContent>

            <div className="grid gap-5 md:grid-cols-3">

              <div className="grid gap-2">

                <Label>
                  EDO Business
                </Label>

                <Select
                  value={
                    isEdoUser
                      ? lockedEdoId
                      : exportEdoFilter
                  }
                  disabled={
                    isEdoUser
                  }
                  onValueChange={
                    setExportEdoFilter
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select EDO business" />
                  </SelectTrigger>

                  <SelectContent>

                    {isTaskraft && (
                      <SelectItem value="all">
                        All EDOs
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

              </div>

              <div className="grid gap-2">

                <Label>
                  From Date
                </Label>

                <Input
                  type="date"
                  value={exportFrom}
                  max={getToday()}
                  onChange={(
                    event
                  ) =>
                    setExportFrom(
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
                  value={exportTo}
                  max={getToday()}
                  onChange={(
                    event
                  ) =>
                    setExportTo(
                      event.target.value
                    )
                  }
                />

              </div>

            </div>

            <div className="mt-5 rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
              Workdays are calculated per employee: 5-day employees are scheduled Monday-Friday, 6-day employees Monday-Saturday. Approved leave is applied automatically. Sunday appears only when Sunday overtime was explicitly confirmed.

              {isTaskraft &&
                exportEdoFilter ===
                "all" && (
                  <span className="mt-2 block font-medium text-foreground">
                    All EDOs will include an EDO Summary, Attendance Register and Employee Summary.
                  </span>
                )}

            </div>

            <div className="mt-5 flex justify-end gap-3">

              <Button
                type="button"
                variant="outline"
                disabled={
                  exporting
                }
                onClick={() =>
                  setShowExport(
                    false
                  )
                }
              >
                Cancel
              </Button>

              <Button
                type="button"
                disabled={
                  exporting
                }
                onClick={
                  downloadAttendance
                }
              >

                {exporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}

                {exporting
                  ? "Preparing Excel..."
                  : "Download Excel"}

              </Button>

            </div>

          </CardContent>

        </Card>

      )}

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
          DAILY FILTERS
      =================================================== */}

      <Card>

        <CardHeader>

          <CardTitle>
            Attendance Register
          </CardTitle>

          <CardDescription>
            {isEdoUser
              ? "Your EDO business is locked from your user access profile. Select a date to manage attendance."
              : "Select an EDO business and date to view the employees."}
          </CardDescription>

        </CardHeader>

        <CardContent>

          <div className="grid gap-4 md:grid-cols-3">

            <div className="grid gap-2">

              <Label>
                Attendance Date
              </Label>

              <div className="relative">

                <CalendarDays className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />

                <Input
                  type="date"
                  value={
                    selectedDate
                  }
                  max={getToday()}
                  onChange={(
                    event
                  ) =>
                    setSelectedDate(
                      event.target.value
                    )
                  }
                  className="pl-9"
                />

              </div>

            </div>

            <div className="grid gap-2">

              <Label>
                EDO Business
              </Label>

              <Select
                value={
                  isEdoUser
                    ? lockedEdoId
                    : edoFilter
                }
                disabled={
                  isEdoUser
                }
                onValueChange={
                  setEdoFilter
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

            <div className="grid gap-2">

              <Label>
                Search
              </Label>

              <div className="relative">

                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />

                <Input
                  value={search}
                  onChange={(
                    event
                  ) =>
                    setSearch(
                      event.target.value
                    )
                  }
                  placeholder="Search employee..."
                  className="pl-9"
                />

              </div>

            </div>

          </div>

          {selectedCompany && (

            <div className="mt-4 text-sm text-muted-foreground">

              Site:{" "}

              <span className="font-medium capitalize text-foreground">
                {selectedCompany.site ||
                  "—"}
              </span>

              {isEdoUser && (
                <Badge
                  variant="outline"
                  className="ml-3"
                >
                  EDO access locked
                </Badge>
              )}

            </div>

          )}

        </CardContent>

      </Card>

      {/* ===================================================
          NO EDO SELECTED
      =================================================== */}

      {!edoFilter &&
        !loading && (

          <Card>

            <CardContent className="flex h-48 items-center justify-center">

              <div className="text-center">

                <Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />

                <p className="font-medium">
                  Select an EDO business
                </p>

                <p className="text-sm text-muted-foreground">
                  The daily attendance register will appear here.
                </p>

              </div>

            </CardContent>

          </Card>

        )}

      {/* ===================================================
          ATTENDANCE
      =================================================== */}

      {edoFilter && (

        <>

          {/* SUMMARY */}

          <div className="grid gap-4 sm:grid-cols-4">

            <Card>

              <CardContent className="pt-6">

                <div className="flex items-center gap-4">

                  <Users className="h-6 w-6 text-muted-foreground" />

                  <div>

                    <div className="text-sm text-muted-foreground">
                      {isSunday(
                        selectedDate
                      )
                        ? "Sunday Worked"
                        : "Scheduled"}
                    </div>

                    <div className="text-2xl font-bold">
                      {totalExpected}
                    </div>

                  </div>

                </div>

              </CardContent>

            </Card>

            <Card className="border-green-500/30">

              <CardContent className="pt-6">

                <div className="flex items-center gap-4">

                  <UserCheck className="h-6 w-6 text-green-600" />

                  <div>

                    <div className="text-sm text-green-700">
                      {isSunday(
                        selectedDate
                      )
                        ? "Sunday OT"
                        : "Present"}
                    </div>

                    <div className="text-2xl font-bold text-green-700">
                      {displayedPresentCount}
                    </div>

                  </div>

                </div>

              </CardContent>

            </Card>

            <Card className="border-blue-500/30">

              <CardContent className="pt-6">

                <div className="flex items-center gap-4">

                  <CalendarDays className="h-6 w-6 text-blue-600" />

                  <div>

                    <div className="text-sm text-blue-700">
                      Leave
                    </div>

                    <div className="text-2xl font-bold text-blue-700">
                      {leaveCount}
                    </div>

                  </div>

                </div>

              </CardContent>

            </Card>

            <Card
              className={
                absentCount > 0
                  ? "border-red-500/30"
                  : ""
              }
            >

              <CardContent className="pt-6">

                <div className="flex items-center gap-4">

                  <UserX
                    className={
                      absentCount >
                        0
                        ? "h-6 w-6 text-red-600"
                        : "h-6 w-6 text-muted-foreground"
                    }
                  />

                  <div>

                    <div
                      className={
                        absentCount >
                          0
                          ? "text-sm text-red-700"
                          : "text-sm text-muted-foreground"
                      }
                    >
                      Absent
                    </div>

                    <div
                      className={
                        absentCount >
                          0
                          ? "text-2xl font-bold text-red-700"
                          : "text-2xl font-bold"
                      }
                    >
                      {absentCount}
                    </div>

                  </div>

                </div>

              </CardContent>

            </Card>

          </div>

          {/* REGISTER */}

          <Card>

            <CardHeader>

              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">

                <div>

                  <CardTitle>
                    {selectedCompany?.name ||
                      "Attendance"}
                  </CardTitle>

                  <CardDescription>
                    {selectedDate}
                  </CardDescription>

                </div>

                {isSunday(
                  selectedDate
                ) ? (
                  <Badge variant="outline">
                    <Clock3 className="mr-1 h-3 w-3" />
                    Sunday overtime confirmation
                  </Badge>
                ) : (
                  <Badge variant="outline">
                    Scheduled staff present by default
                  </Badge>
                )}

              </div>

            </CardHeader>

            <CardContent>

              {loading ||
                loadingAttendance ? (

                <div className="flex h-48 items-center justify-center">

                  <div className="flex items-center gap-3 text-muted-foreground">

                    <Loader2 className="h-5 w-5 animate-spin" />

                    Loading attendance...

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
                          Occupation
                        </TableHead>

                        <TableHead>
                          Work Week
                        </TableHead>

                        <TableHead>
                          Attendance
                        </TableHead>

                        <TableHead>
                          Reason
                        </TableHead>

                        <TableHead>
                          Notes
                        </TableHead>

                        <TableHead className="w-[150px]" />

                      </TableRow>

                    </TableHeader>

                    <TableBody>

                      {visibleEmployees.map(
                        (employee) => {

                          const leave =
                            employeeLeave(
                              employee
                            );

                          const sundayWorked =
                            !!sundayWorkRecords[
                            employee.id
                            ];

                          const state =
                            attendance[
                            employee.id
                            ] || {
                              status:
                                "present" as const,
                              reason: "",
                              notes: "",
                              originalStatus:
                                "present" as const,
                              originalReason:
                                "",
                              originalNotes:
                                "",
                            };

                          const changed =
                            hasChanged(
                              employee.id
                            );

                          /* =================================
                             SUNDAY ROW
                          ================================= */

                          if (
                            isSunday(
                              selectedDate
                            )
                          ) {
                            return (

                              <TableRow
                                key={
                                  employee.id
                                }
                              >

                                <TableCell>

                                  <div className="font-medium">
                                    {employee.firstName}{" "}
                                    {employee.surname}
                                  </div>

                                  <div className="text-xs text-muted-foreground">
                                    {employee.employeeCode}
                                  </div>

                                </TableCell>

                                <TableCell>
                                  {employee.occupation ||
                                    "—"}
                                </TableCell>

                                <TableCell>

                                  <Badge
                                    variant="outline"
                                    className={
                                      employee.workWeek ===
                                        "6_day"
                                        ? "border-amber-400 bg-amber-100 text-amber-800"
                                        : "border-blue-400 bg-blue-100 text-blue-800"
                                    }
                                  >
                                    {workWeekLabel(
                                      employee
                                    )}
                                  </Badge>

                                </TableCell>

                                <TableCell>

                                  {sundayWorked ? (
                                    <Badge className="bg-green-600">
                                      Sunday Overtime
                                    </Badge>
                                  ) : (
                                    <span className="text-sm text-muted-foreground">
                                      Not worked
                                    </span>
                                  )}

                                </TableCell>

                                <TableCell>
                                  {sundayWorked
                                    ? "Sunday Work"
                                    : "—"}
                                </TableCell>

                                <TableCell>
                                  <span className="text-sm text-muted-foreground">
                                    —
                                  </span>
                                </TableCell>

                                <TableCell>

                                  <Button
                                    size="sm"
                                    variant={
                                      sundayWorked
                                        ? "outline"
                                        : "default"
                                    }
                                    onClick={() =>
                                      toggleSundayWork(
                                        employee
                                      )
                                    }
                                    disabled={
                                      savingSundayId ===
                                      employee.id
                                    }
                                  >

                                    {savingSundayId ===
                                      employee.id ? (
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : sundayWorked ? (
                                      <CheckCircle2 className="mr-2 h-4 w-4" />
                                    ) : (
                                      <Clock3 className="mr-2 h-4 w-4" />
                                    )}

                                    {sundayWorked
                                      ? "Worked ✓"
                                      : "Confirm Worked"}

                                  </Button>

                                </TableCell>

                              </TableRow>

                            );
                          }

                          /* =================================
                             NORMAL SCHEDULED DAY
                          ================================= */

                          return (

                            <TableRow
                              key={
                                employee.id
                              }
                            >

                              <TableCell>

                                <div className="font-medium">
                                  {employee.firstName}{" "}
                                  {employee.surname}
                                </div>

                                <div className="text-xs text-muted-foreground">
                                  {employee.employeeCode}
                                </div>

                              </TableCell>

                              <TableCell>
                                {employee.occupation ||
                                  "—"}
                              </TableCell>

                              <TableCell>

                                <Badge
                                  variant="outline"
                                  className={
                                    employee.workWeek ===
                                      "6_day"
                                      ? "border-amber-400 bg-amber-100 text-amber-800"
                                      : "border-blue-400 bg-blue-100 text-blue-800"
                                  }
                                >
                                  {workWeekLabel(
                                    employee
                                  )}
                                </Badge>

                              </TableCell>

                              <TableCell>

                                {leave ? (

                                  <Badge className="bg-blue-600">
                                    Leave
                                  </Badge>

                                ) : (

                                  <Select
                                    value={
                                      state.status
                                    }
                                    onValueChange={(
                                      value
                                    ) =>
                                      updateAttendance(
                                        employee.id,
                                        "status",
                                        value
                                      )
                                    }
                                  >

                                    <SelectTrigger className="w-[140px]">
                                      <SelectValue />
                                    </SelectTrigger>

                                    <SelectContent>

                                      <SelectItem value="present">
                                        Present
                                      </SelectItem>

                                      <SelectItem value="absent">
                                        Absent
                                      </SelectItem>

                                      {isFiveDaySaturday(
                                        employee,
                                        selectedDate
                                      ) && (
                                          <SelectItem value="off">
                                            Off
                                          </SelectItem>
                                        )}

                                    </SelectContent>

                                  </Select>

                                )}

                              </TableCell>

                              <TableCell>

                                {leave ? (

                                  <span className="text-sm font-medium text-blue-700">
                                    {leaveTypeLabel(
                                      leave.leaveType
                                    )}
                                  </span>

                                ) : state.status ===
                                  "absent" ? (

                                  <Select
                                    value={
                                      state.reason
                                    }
                                    onValueChange={(
                                      value
                                    ) =>
                                      updateAttendance(
                                        employee.id,
                                        "reason",
                                        value
                                      )
                                    }
                                  >

                                    <SelectTrigger className="min-w-[160px]">
                                      <SelectValue placeholder="Select reason" />
                                    </SelectTrigger>

                                    <SelectContent>

                                      <SelectItem value="awol">
                                        AWOL
                                      </SelectItem>

                                      <SelectItem value="other">
                                        Other
                                      </SelectItem>

                                    </SelectContent>

                                  </Select>

                                ) : (

                                  <span className="text-sm text-muted-foreground">
                                    —
                                  </span>

                                )}

                              </TableCell>

                              <TableCell>

                                {leave ? (

                                  <span className="text-sm text-muted-foreground">
                                    {leave.notes ||
                                      "Approved leave"}
                                  </span>

                                ) : state.status ===
                                  "absent" ? (

                                  <Input
                                    value={
                                      state.notes
                                    }
                                    onChange={(
                                      event
                                    ) =>
                                      updateAttendance(
                                        employee.id,
                                        "notes",
                                        event.target.value
                                      )
                                    }
                                    placeholder="Optional note"
                                    className="min-w-[180px]"
                                  />

                                ) : (

                                  <span className="text-sm text-muted-foreground">
                                    —
                                  </span>

                                )}

                              </TableCell>

                              <TableCell>

                                {leave ? (

                                  <Badge variant="outline">
                                    Approved
                                  </Badge>

                                ) : changed ? (

                                  <Button
                                    size="sm"
                                    onClick={() =>
                                      saveEmployee(
                                        employee
                                      )
                                    }
                                    disabled={
                                      savingEmployeeId ===
                                      employee.id
                                    }
                                  >

                                    {savingEmployeeId ===
                                      employee.id ? (
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                      <Save className="mr-2 h-4 w-4" />
                                    )}

                                    Save

                                  </Button>

                                ) : state.status ===
                                  "absent" ? (

                                  <Badge variant="destructive">
                                    Recorded
                                  </Badge>

                                ) : state.status ===
                                  "off" ? (

                                  <Badge
                                    variant="outline"
                                    className="border-slate-300 bg-slate-100 text-slate-700"
                                  >
                                    Off
                                  </Badge>

                                ) : (

                                  <div className="flex items-center gap-1 text-xs text-green-700">

                                    <CheckCircle2 className="h-4 w-4" />

                                    Present

                                  </div>

                                )}

                              </TableCell>

                            </TableRow>

                          );
                        }
                      )}

                      {visibleEmployees.length ===
                        0 && (

                          <TableRow>

                            <TableCell
                              colSpan={7}
                              className="h-24 text-center text-muted-foreground"
                            >
                              {isSunday(
                                selectedDate
                              )
                                ? "No active employees available for Sunday overtime confirmation."
                                : "No employees scheduled for this date."}
                            </TableCell>

                          </TableRow>

                        )}

                    </TableBody>

                  </Table>

                </div>

              )}

              {!loading &&
                !loadingAttendance &&
                visibleEmployees.length >
                0 && (

                  <div className="mt-4 text-sm text-muted-foreground">

                    {isSunday(
                      selectedDate
                    ) ? (
                      <>
                        <span className="font-medium text-green-700">
                          {Object.keys(
                            sundayWorkRecords
                          ).length}{" "}
                          Sunday overtime confirmation(s)
                        </span>
                        . Sunday is never assumed worked.
                      </>
                    ) : (
                      <>
                        {totalExpected} scheduled{" "}
                        •{" "}
                        <span className="font-medium text-green-700">
                          {displayedPresentCount} present
                        </span>{" "}
                        •{" "}
                        <span className="font-medium text-blue-700">
                          {leaveCount} leave
                        </span>{" "}
                        •{" "}
                        <span
                          className={
                            absentCount >
                              0
                              ? "font-medium text-red-700"
                              : ""
                          }
                        >
                          {absentCount} absent
                        </span>
                        {getDayOfWeek(selectedDate) === 6 && (
                          <>
                            {" "}
                            •{" "}
                            <span className="font-medium text-slate-700">
                              {offCount} off
                            </span>
                          </>
                        )}
                      </>
                    )}

                  </div>

                )}

            </CardContent>

          </Card>

        </>

      )}

    </div>
  );
}