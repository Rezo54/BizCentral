"use client";

import { ChangeEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  Upload,
  XCircle,
} from "lucide-react";

import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/* =========================================================
   TYPES
========================================================= */

type EdoCompany = {
  id: string;
  name: string;
  site: string;
};

type EmployeeImportRow = {
  rowNumber: number;

  companyName: string;
  employeeCode: string;
  firstName: string;
  surname: string;
  occupation: string;
  workWeek: string;
  idNumber: string;
  cellphone: string;

  dateOfBirth: string;
  appointmentDate: string;

  status: string;

  terminationDate: string;
  terminationReason: string;

  edoId: string;
  site: string;

  valid: boolean;
  warnings: string[];
  errors: string[];
};

/* =========================================================
   HELPERS
========================================================= */

function clean(value: unknown): string {
  if (value === null || value === undefined) return "";

  return String(value).trim();
}

function normaliseCompanyName(value: string): string {
  return value.trim().toLowerCase();
}

function normaliseStatus(value: string): string {
  const status = value.trim().toLowerCase();

  if (status === "employed") return "employed";
  if (status === "terminated") return "terminated";

  return status;
}

function normaliseWorkWeek(value: string): string {
  const workWeek = value
    .trim()
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ");

  if (
    workWeek === "5" ||
    workWeek === "5 day" ||
    workWeek === "5 days" ||
    workWeek === "5 day worker" ||
    workWeek === "5 days worker"
  ) {
    return "5_day";
  }

  if (
    workWeek === "6" ||
    workWeek === "6 day" ||
    workWeek === "6 days" ||
    workWeek === "6 day worker" ||
    workWeek === "6 days worker"
  ) {
    return "6_day";
  }

  return "";
}

/* =========================================================
   EXCEL DATE HANDLING
========================================================= */

function excelDateToString(value: unknown): string {
  if (!value) return "";

  /*
    XLSX may return a JavaScript Date if cellDates:true is used.
  */

  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  /*
    Excel serial date.
  */

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);

    if (parsed) {
      const year = parsed.y;
      const month = String(parsed.m).padStart(2, "0");
      const day = String(parsed.d).padStart(2, "0");

      return `${year}-${month}-${day}`;
    }
  }

  /*
    Text date fallback.
  */

  const text = String(value).trim();

  if (!text) return "";

  const date = new Date(text);

  if (!Number.isNaN(date.getTime())) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  return text;
}

/* =========================================================
   EMPLOYEE DOCUMENT ID
========================================================= */

function createEmployeeId(
  edoId: string,
  employeeCode: string
): string {
  const cleanCode = employeeCode
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return `${edoId}-${cleanCode}`;
}

/* =========================================================
   PAGE
========================================================= */

export default function EmployeeUploadPage() {
  const router = useRouter();

  const [rows, setRows] = useState<EmployeeImportRow[]>([]);
  const [fileName, setFileName] = useState("");

  const [processing, setProcessing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  /* =======================================================
     READ EDO COMPANIES
  ======================================================= */

  async function loadCompanies(): Promise<EdoCompany[]> {
    const snapshot = await getDocs(
      collection(db, "companies")
    );

    return snapshot.docs
      .map((companyDoc) => {
        const data = companyDoc.data();

        return {
          id: data.id || companyDoc.id,
          name: clean(data.name),
          site: clean(data.site),
          type: clean(data.type),
        };
      })
      .filter((company: any) => company.type === "edo");
  }

  /* =======================================================
     FILE UPLOAD / SPREADSHEET READING
  ======================================================= */

  async function handleFileUpload(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (!file) return;

    setProcessing(true);
    setMessage("");
    setRows([]);
    setFileName(file.name);

    try {
      /* -----------------------------------------------
         LOAD FIREBASE EDO MASTER
      ------------------------------------------------ */

      const companies = await loadCompanies();

      const companyMap = new Map<string, EdoCompany>();

      companies.forEach((company) => {
        companyMap.set(
          normaliseCompanyName(company.name),
          company
        );
      });

      /* -----------------------------------------------
         READ EXCEL
      ------------------------------------------------ */

      const buffer = await file.arrayBuffer();

      const workbook = XLSX.read(buffer, {
        type: "array",
        cellDates: true,
      });

      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      const rawRows: any[] = XLSX.utils.sheet_to_json(
        sheet,
        {
          defval: "",
          raw: true,
        }
      );

      /* -----------------------------------------------
         NORMALISE + VALIDATE
      ------------------------------------------------ */

      const parsedRows: EmployeeImportRow[] = [];

      rawRows.forEach((rawRow, index) => {
        const normalized: Record<string, unknown> = {};

        Object.keys(rawRow).forEach((key) => {
          normalized[key.trim().toLowerCase()] =
            rawRow[key];
        });

        /* ---------------------------------------------
           COMPANY
        ---------------------------------------------- */

        const companyName = clean(
          normalized["company name"]
        );

        /* ---------------------------------------------
           EMPLOYEE CODE
        ---------------------------------------------- */

        const employeeCode = clean(
          normalized["employee code"]
        );

        /* ---------------------------------------------
           EMPLOYEE NAME

           Preferred:
           First Name | Surname

           Also accepts:
           Name | Surname

           Backwards compatible with:
           Employee Name
        ---------------------------------------------- */

        let firstName = clean(
          normalized["first name"] ||
            normalized["name"]
        );

        let surname = clean(
          normalized["surname"] ||
            normalized["last name"]
        );

        const fullName = clean(
          normalized["employee name"]
        );

        if (!firstName && fullName) {
          const nameParts = fullName
            .split(/\s+/)
            .filter(Boolean);

          firstName = nameParts.shift() || "";

          if (!surname) {
            surname = nameParts.join(" ");
          }
        }

        /* ---------------------------------------------
           EMPLOYEE DETAILS
        ---------------------------------------------- */

        const occupation = clean(
          normalized["occupation"]
        );

        const workWeek = normaliseWorkWeek(
          clean(
            normalized["work week"] ??
              normalized["workweek"] ??
              normalized["work week type"]
          )
        );

        const idNumber = clean(
          normalized["id number"]
        );

        const cellphone = clean(
          normalized["cellphone"]
        );

        const dateOfBirth = excelDateToString(
          normalized["date of birth"]
        );

        const appointmentDate = excelDateToString(
          normalized["appointment date"] ??
            normalized["date engaged"]
        );

        const status = normaliseStatus(
          clean(normalized["status"])
        );

        const terminationDate = excelDateToString(
          normalized["termination date"] ??
            normalized["end date"]
        );

        const terminationReason = clean(
          normalized["termination reason"] ??
            normalized["reason"]
        );

        /* ---------------------------------------------
           IGNORE BLANK / SUMMARY ROWS
        ---------------------------------------------- */

        const looksLikeEmployee =
          employeeCode ||
          firstName ||
          surname ||
          idNumber;

        if (!looksLikeEmployee) {
          return;
        }

        /* ---------------------------------------------
           VALIDATION
        ---------------------------------------------- */

        const errors: string[] = [];
        const warnings: string[] = [];

        /* ---------------------------------------------
           COMPANY VALIDATION
        ---------------------------------------------- */

        let edoId = "";
        let site = "";

        const matchedCompany = companyMap.get(
          normaliseCompanyName(companyName)
        );

        if (!companyName) {
          errors.push("Company Name missing");
        } else if (!matchedCompany) {
          errors.push(
            "Company not found in BizCentral"
          );
        } else {
          edoId = matchedCompany.id;
          site = matchedCompany.site;
        }

        /* ---------------------------------------------
           REQUIRED FIELDS
        ---------------------------------------------- */

        if (!employeeCode) {
          errors.push("Employee Code missing");
        }

        if (!firstName) {
          errors.push("First Name missing");
        }

        if (!surname) {
          errors.push("Surname missing");
        }

        if (!occupation) {
          warnings.push("Occupation missing");
        }

        if (!workWeek) {
          errors.push(
            "Work Week missing or invalid — use 5 Day or 6 Day"
          );
        }

        if (!appointmentDate) {
          errors.push("Appointment Date missing");
        }

        /* ---------------------------------------------
           STATUS
        ---------------------------------------------- */

        if (!status) {
          errors.push("Status missing");
        } else if (
          status !== "employed" &&
          status !== "terminated"
        ) {
          errors.push(
            `Unknown status: ${status}`
          );
        }

        /* ---------------------------------------------
           TERMINATION
        ---------------------------------------------- */

        if (
          status === "terminated" &&
          !terminationDate
        ) {
          warnings.push(
            "Terminated employee has no termination date"
          );
        }

        /* ---------------------------------------------
           ID NUMBER
        ---------------------------------------------- */

        if (!idNumber) {
          warnings.push("ID Number missing");
        } else if (!/^\d{13}$/.test(idNumber)) {
          warnings.push(
            "ID Number is not 13 digits"
          );
        }

        /* ---------------------------------------------
           CELLPHONE
        ---------------------------------------------- */

        if (!cellphone) {
          warnings.push("Cellphone missing");
        }

        /* ---------------------------------------------
           ADD ROW
        ---------------------------------------------- */

        parsedRows.push({
          rowNumber: index + 2,

          companyName,
          employeeCode,
          firstName,
          surname,
          workWeek,
          occupation,
          idNumber,
          cellphone,

          dateOfBirth,
          appointmentDate,

          status,

          terminationDate,
          terminationReason,

          edoId,
          site,

          valid: errors.length === 0,
          warnings,
          errors,         
        });
      });

      /* -----------------------------------------------
         DUPLICATE EMPLOYEE CODE CHECK

         Employee code must be unique within an EDO.
      ------------------------------------------------ */

      const codeCounts = new Map<string, number>();

      parsedRows.forEach((row) => {
        const key =
          `${row.edoId}|${row.employeeCode}`.toLowerCase();

        codeCounts.set(
          key,
          (codeCounts.get(key) || 0) + 1
        );
      });

      parsedRows.forEach((row) => {
        const key =
          `${row.edoId}|${row.employeeCode}`.toLowerCase();

        if ((codeCounts.get(key) || 0) > 1) {
          row.errors.push(
            "Duplicate Employee Code in spreadsheet"
          );

          row.valid = false;
        }
      });

      setRows(parsedRows);

      setMessage(
        `Loaded ${parsedRows.length} employee records.`
      );
    } catch (error) {
      console.error(error);

      setMessage(
        "Unable to read employee spreadsheet."
      );
    } finally {
      setProcessing(false);
    }
  }

  /* =======================================================
     COUNTS
  ======================================================= */

  const validRows = useMemo(
    () => rows.filter((row) => row.valid),
    [rows]
  );

  const errorRows = useMemo(
    () => rows.filter((row) => !row.valid),
    [rows]
  );

  const warningRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          row.valid &&
          row.warnings.length > 0
      ),
    [rows]
  );

  /* =======================================================
     FIREBASE EMPLOYEE UPLOAD
  ======================================================= */

  async function uploadEmployees() {
    if (validRows.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      `Upload ${validRows.length} valid employees to BizCentral?`
    );

    if (!confirmed) {
      return;
    }

    setUploading(true);
    setMessage("");

    let uploaded = 0;
    let failed = 0;

    try {
      for (const row of validRows) {
        try {
          const employeeId = createEmployeeId(
            row.edoId,
            row.employeeCode
          );

          await setDoc(
            doc(db, "employees", employeeId),
            {
              id: employeeId,

              employeeCode: row.employeeCode,

              firstName: row.firstName,
              surname: row.surname,

              edoId: row.edoId,
              edoName: row.companyName,
              site: row.site,

              occupation: row.occupation,

              workWeek: row.workWeek,

              idNumber: row.idNumber,
              cellphone: row.cellphone,

              dateOfBirth: row.dateOfBirth,
              appointmentDate:
                row.appointmentDate,

              status: row.status,

              terminationDate:
                row.terminationDate || null,

              terminationReason:
                row.terminationReason || null,

              updatedAt: serverTimestamp(),
            },
            {
              merge: true,
            }
          );

          uploaded++;
        } catch (error) {
          console.error(
            `Failed employee ${row.employeeCode}:`,
            error
          );

          failed++;
        }
      }

      /* -----------------------------------------------
         UPLOAD COMPLETE MESSAGE
      ------------------------------------------------ */

      if (failed === 0) {
        alert(
          `Employee upload completed successfully!\n\n` +
            `${uploaded} employee${
              uploaded === 1 ? "" : "s"
            } uploaded to BizCentral.\n\n` +
            `Press OK to return to the top of the page.`
        );

        setMessage(
          `✓ Upload completed successfully — ${uploaded} employee${
            uploaded === 1 ? "" : "s"
          } uploaded.`
        );
      } else {
        alert(
          `Employee upload completed with some errors.\n\n` +
            `${uploaded} uploaded successfully\n` +
            `${failed} failed\n\n` +
            `Press OK to return to the top of the page.`
        );

        setMessage(
          `Upload completed — ${uploaded} uploaded, ${failed} failed.`
        );
      }

      /*
        alert() waits for the user to press OK.

        Therefore this executes AFTER acknowledgement
        and returns the user to the Back button.
      */

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } catch (error) {
      console.error(
        "Employee upload error:",
        error
      );

      alert(
        "Employee upload failed. Please check the browser console for details."
      );

      setMessage(
        "Employee upload failed. Check the console for details."
      );

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } finally {
      setUploading(false);
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

      <div className="flex items-center gap-4">

        <Button
          variant="outline"
          size="icon"
          onClick={() => router.push("/people")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Bulk Employee Upload
          </h1>

          <p className="text-muted-foreground">
            Import and validate employee master data before
            uploading it to BizCentral.
          </p>
        </div>

      </div>

      {/* ===================================================
          FILE SELECT
      =================================================== */}

      <Card>

        <CardHeader>
          <CardTitle>
            Employee Spreadsheet
          </CardTitle>
        </CardHeader>

        <CardContent>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">

            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent">

              <FileSpreadsheet className="h-4 w-4" />

              Select Excel File

              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
              />

            </label>

            {fileName && (
              <span className="text-sm text-muted-foreground">
                {fileName}
              </span>
            )}

            {processing && (
              <span className="text-sm">
                Reading spreadsheet...
              </span>
            )}

          </div>

          {message && (
            <p className="mt-4 text-sm font-medium">
              {message}
            </p>
          )}

        </CardContent>

      </Card>

      {/* ===================================================
          RESULTS
      =================================================== */}

      {rows.length > 0 && (
        <>

          {/* =================================================
              SUMMARY
          ================================================= */}

          <div className="grid gap-4 sm:grid-cols-3">

            {/* READY */}

            <Card>

              <CardContent className="pt-6">

                <div className="flex items-center gap-3">

                  <CheckCircle2 className="h-5 w-5" />

                  <div>

                    <p className="text-sm text-muted-foreground">
                      Ready
                    </p>

                    <p className="text-2xl font-bold">
                      {validRows.length}
                    </p>

                  </div>

                </div>

              </CardContent>

            </Card>

            {/* WARNINGS */}

            <Card>

              <CardContent className="pt-6">

                <div className="flex items-center gap-3">

                  <AlertCircle className="h-5 w-5" />

                  <div>

                    <p className="text-sm text-muted-foreground">
                      Warnings
                    </p>

                    <p className="text-2xl font-bold">
                      {warningRows.length}
                    </p>

                  </div>

                </div>

              </CardContent>

            </Card>

            {/* ERRORS */}

            <Card>

              <CardContent className="pt-6">

                <div className="flex items-center gap-3">

                  <XCircle className="h-5 w-5" />

                  <div>

                    <p className="text-sm text-muted-foreground">
                      Errors
                    </p>

                    <p className="text-2xl font-bold">
                      {errorRows.length}
                    </p>

                  </div>

                </div>

              </CardContent>

            </Card>

          </div>

          {/* =================================================
              PREVIEW
          ================================================= */}

          <Card>

            <CardHeader>
              <CardTitle>
                Upload Preview
              </CardTitle>
            </CardHeader>

            <CardContent>

              <div className="overflow-x-auto rounded-md border">

                <Table>

                  <TableHeader>

                    <TableRow>

                      <TableHead>Row</TableHead>

                      <TableHead>
                        Company
                      </TableHead>

                      <TableHead>
                        Code
                      </TableHead>

                      <TableHead>
                        Employee
                      </TableHead>

                      <TableHead>
                        Occupation
                      </TableHead>

                      <TableHead>
                        Occupation
                      </TableHead>

                      <TableHead>
                        Work Week
                      </TableHead>

                      <TableHead>
                        Appointment
                      </TableHead>

                      <TableHead>
                        Status
                      </TableHead>

                      <TableHead>
                        Validation
                      </TableHead>

                    </TableRow>

                  </TableHeader>

                  <TableBody>

                    {rows.map((row) => (

                      <TableRow
                        key={row.rowNumber}
                      >

                        <TableCell>
                          {row.rowNumber}
                        </TableCell>

                        <TableCell>

                          <div>
                            {row.companyName}
                          </div>

                          {row.edoId && (
                            <div className="text-xs text-muted-foreground">
                              {row.edoId}
                            </div>
                          )}

                        </TableCell>

                        <TableCell>
                          {row.employeeCode}
                        </TableCell>

                        <TableCell>
                          {row.firstName}{" "}
                          {row.surname}
                        </TableCell>

                        <TableCell>
                          {row.occupation || "—"}
                        </TableCell>

                        <TableCell>
                          {row.workWeek === "5_day"
                            ? "5 Day"
                            : row.workWeek === "6_day"
                              ? "6 Day"
                              : "—"}
                        </TableCell>

                        <TableCell>
                          {row.appointmentDate}
                        </TableCell>

                        <TableCell>

                          <Badge variant="outline">
                            {row.status || "—"}
                          </Badge>

                        </TableCell>

                        <TableCell className="min-w-[260px]">

                          {row.valid &&
                            row.warnings.length ===
                              0 && (
                              <Badge>
                                Ready
                              </Badge>
                            )}

                          {row.warnings.map(
                            (warning, index) => (
                              <div
                                key={`warning-${index}`}
                                className="text-sm"
                              >
                                ⚠ {warning}
                              </div>
                            )
                          )}

                          {row.errors.map(
                            (error, index) => (
                              <div
                                key={`error-${index}`}
                                className="text-sm text-destructive"
                              >
                                ✕ {error}
                              </div>
                            )
                          )}

                        </TableCell>

                      </TableRow>

                    ))}

                  </TableBody>

                </Table>

              </div>

              {/* =================================================
                  UPLOAD BUTTON
              ================================================= */}

              <div className="mt-6 flex justify-end">

                <Button
                  disabled={
                    validRows.length === 0 ||
                    uploading
                  }
                  onClick={uploadEmployees}
                >

                  <Upload className="mr-2 h-4 w-4" />

                  {uploading
                    ? "Uploading..."
                    : `Upload ${validRows.length} Valid Employees`}

                </Button>

              </div>

            </CardContent>

          </Card>

        </>
      )}

    </div>
  );
}