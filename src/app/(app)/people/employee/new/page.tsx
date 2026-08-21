"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  ArrowLeft,
  Building2,
  Loader2,
  Save,
  UserPlus,
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

/* =========================================================
   TYPES
========================================================= */

type EdoCompany = {
  id: string;
  name: string;
  site: string;
};

type EmployeeForm = {
  edoId: string;

  employeeCode: string;

  firstName: string;
  surname: string;

  occupation: string;

  // 5_day = Monday-Friday
  // 6_day = Monday-Saturday
  workWeek: string;

  idNumber: string;
  cellphone: string;

  dateOfBirth: string;
  appointmentDate: string;

  status: string;
};

/* =========================================================
   INITIAL FORM
========================================================= */

const initialForm: EmployeeForm = {
  edoId: "",

  employeeCode: "",

  firstName: "",
  surname: "",

  occupation: "",
  workWeek: "",

  idNumber: "",
  cellphone: "",

  dateOfBirth: "",
  appointmentDate: "",

  status: "employed",
};

/* =========================================================
   HELPERS
========================================================= */

function clean(value: string) {
  return value.trim();
}

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

export default function AddEmployeePage() {
  const router = useRouter();

  const [companies, setCompanies] =
    useState<EdoCompany[]>([]);

  const [form, setForm] =
    useState<EmployeeForm>(initialForm);

  const [loadingCompanies, setLoadingCompanies] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  /* =======================================================
     LOAD EDO BUSINESSES
  ======================================================= */

  useEffect(() => {
    async function loadCompanies() {
      try {
        setLoadingCompanies(true);
        setError("");

        const snapshot = await getDocs(
          collection(db, "companies")
        );

        const companyData = snapshot.docs
          .map((companyDoc) => {
            const data = companyDoc.data();

            return {
              id: data.id || companyDoc.id,
              name: data.name || "",
              site: data.site || "",
              type: data.type || "",
            };
          })
          .filter(
            (company) =>
              company.type === "edo"
          )
          .sort((a, b) =>
            a.name.localeCompare(b.name)
          );

        setCompanies(companyData);

      } catch (error) {
        console.error(
          "Error loading EDO companies:",
          error
        );

        setError(
          "Unable to load EDO businesses."
        );

      } finally {
        setLoadingCompanies(false);
      }
    }

    loadCompanies();
  }, []);

  /* =======================================================
     SELECTED EDO
  ======================================================= */

  const selectedCompany = useMemo(
    () =>
      companies.find(
        (company) =>
          company.id === form.edoId
      ),
    [companies, form.edoId]
  );

  /* =======================================================
     STANDARD INPUT CHANGE
  ======================================================= */

  function updateField(
    field: keyof EmployeeForm,
    value: string
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  /* =======================================================
     VALIDATION
  ======================================================= */

  function validateForm(): string[] {
    const errors: string[] = [];

    if (!form.edoId) {
      errors.push(
        "Please select an EDO business."
      );
    }

    if (!clean(form.employeeCode)) {
      errors.push(
        "Employee Code is required."
      );
    }

    if (!clean(form.firstName)) {
      errors.push(
        "First Name is required."
      );
    }

    if (!clean(form.surname)) {
      errors.push(
        "Surname is required."
      );
    }

    if (!clean(form.occupation)) {
      errors.push(
        "Occupation is required."
      );
    }

    /*
      Work Week is required because Attendance
      and Leave will use this field to determine
      whether Saturday is a working day.
    */

    if (!form.workWeek) {
      errors.push(
        "Work Week is required."
      );
    }

    if (!form.appointmentDate) {
      errors.push(
        "Appointment Date is required."
      );
    }

    if (!form.status) {
      errors.push(
        "Status is required."
      );
    }

    /*
      ID number remains optional for now,
      matching the bulk uploader.

      But if entered, validate SA-style
      13 digit structure.
    */

    const idNumber = clean(
      form.idNumber
    );

    if (
      idNumber &&
      !/^\d{13}$/.test(idNumber)
    ) {
      errors.push(
        "ID Number must contain 13 digits."
      );
    }

    return errors;
  }

  /* =======================================================
     SAVE EMPLOYEE
  ======================================================= */

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");

    const validationErrors =
      validateForm();

    if (validationErrors.length > 0) {
      setError(
        validationErrors.join(" ")
      );

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });

      return;
    }

    if (!selectedCompany) {
      setError(
        "The selected EDO business could not be found."
      );

      return;
    }

    const employeeId =
      createEmployeeId(
        form.edoId,
        form.employeeCode
      );

    /*
      IMPORTANT:

      Before saving, check whether this exact
      EDO + Employee Code already exists.

      This prevents Add Employee from silently
      overwriting an existing employee.
    */

    const existingEmployees =
      await getDocs(
        collection(db, "employees")
      );

    const duplicateExists =
      existingEmployees.docs.some(
        (employeeDoc) => {
          const data =
            employeeDoc.data();

          return (
            String(
              data.edoId || ""
            ).toLowerCase() ===
              form.edoId.toLowerCase() &&
            String(
              data.employeeCode || ""
            )
              .trim()
              .toLowerCase() ===
              clean(form.employeeCode)
                .toLowerCase()
          );
        }
      );

    if (duplicateExists) {
      setError(
        `Employee Code ${clean(
          form.employeeCode
        )} already exists for ${selectedCompany.name}.`
      );

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });

      return;
    }

    const confirmed =
      window.confirm(
        `Add ${clean(
          form.firstName
        )} ${clean(
          form.surname
        )} to ${selectedCompany.name}?`
      );

    if (!confirmed) {
      return;
    }

    try {
      setSaving(true);

      await setDoc(
        doc(
          db,
          "employees",
          employeeId
        ),
        {
          id: employeeId,

          employeeCode:
            clean(
              form.employeeCode
            ),

          firstName:
            clean(
              form.firstName
            ),

          surname:
            clean(
              form.surname
            ),

          edoId:
            selectedCompany.id,

          edoName:
            selectedCompany.name,

          site:
            selectedCompany.site,

          occupation:
            clean(
              form.occupation
            ),

          /*
            Store normalized work-week value.

            5_day = Monday-Friday
            6_day = Monday-Saturday
          */

          workWeek:
            form.workWeek,

          idNumber:
            clean(
              form.idNumber
            ),

          cellphone:
            clean(
              form.cellphone
            ),

          dateOfBirth:
            form.dateOfBirth || "",

          appointmentDate:
            form.appointmentDate,

          status:
            form.status,

          terminationDate: null,
          terminationReason: null,

          /*
            Helps distinguish manually created
            employees from bulk-uploaded records.
          */

          source:
            "manual",

          lastUpdatedSource:
            "manual",

          createdAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp(),
        }
      );

      /*
        The alert blocks execution until
        the user acknowledges it.
      */

      alert(
        `Employee added successfully!\n\n` +
          `${clean(
            form.firstName
          )} ${clean(
            form.surname
          )}\n` +
          `${selectedCompany.name}\n` +
          `${
            form.workWeek === "6_day"
              ? "6 Day Worker"
              : "5 Day Worker"
          }`
      );

      /*
        After acknowledgement return directly
        to the live Employee Register.
      */

      router.push("/people");

    } catch (error) {
      console.error(
        "Error adding employee:",
        error
      );

      setError(
        "Employee could not be added. Please check the browser console for details."
      );

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });

    } finally {
      setSaving(false);
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
          type="button"
          onClick={() =>
            router.push("/people")
          }
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div>

          <h1 className="text-3xl font-bold tracking-tight">
            Add Employee
          </h1>

          <p className="text-muted-foreground">
            Add an individual employee to an
            EDO business.
          </p>

        </div>

      </div>

      {/* ===================================================
          ERROR
      =================================================== */}

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ===================================================
          FORM
      =================================================== */}

      <form onSubmit={handleSubmit}>

        <div className="grid gap-6">

          {/* =================================================
              BUSINESS
          ================================================= */}

          <Card>

            <CardHeader>

              <CardTitle className="flex items-center gap-2">

                <Building2 className="h-5 w-5" />

                EDO Business

              </CardTitle>

              <CardDescription>
                Select the business this employee
                belongs to. The site will be assigned
                automatically.
              </CardDescription>

            </CardHeader>

            <CardContent className="space-y-5">

              <div className="grid gap-2">

                <Label>
                  EDO Business *
                </Label>

                <Select
                  value={form.edoId}
                  onValueChange={(value) =>
                    updateField(
                      "edoId",
                      value
                    )
                  }
                  disabled={
                    loadingCompanies
                  }
                >

                  <SelectTrigger>

                    <SelectValue
                      placeholder={
                        loadingCompanies
                          ? "Loading EDO businesses..."
                          : "Select EDO business"
                      }
                    />

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

              {/* SITE */}

              {selectedCompany && (

                <div className="rounded-md border bg-muted/30 p-4">

                  <div className="text-xs text-muted-foreground">
                    Site
                  </div>

                  <div className="mt-1 font-medium capitalize">
                    {selectedCompany.site ||
                      "No site assigned"}
                  </div>

                </div>

              )}

            </CardContent>

          </Card>

          {/* =================================================
              EMPLOYEE DETAILS
          ================================================= */}

          <Card>

            <CardHeader>

              <CardTitle className="flex items-center gap-2">

                <UserPlus className="h-5 w-5" />

                Employee Details

              </CardTitle>

              <CardDescription>
                Capture the employee&apos;s master
                information.
              </CardDescription>

            </CardHeader>

            <CardContent>

              <div className="grid gap-5 md:grid-cols-2">

                {/* EMPLOYEE CODE */}

                <div className="grid gap-2">

                  <Label htmlFor="employeeCode">
                    Employee Code *
                  </Label>

                  <Input
                    id="employeeCode"
                    value={
                      form.employeeCode
                    }
                    onChange={(event) =>
                      updateField(
                        "employeeCode",
                        event.target.value
                      )
                    }
                    placeholder="e.g. BG005"
                  />

                </div>

                {/* OCCUPATION */}

                <div className="grid gap-2">

                  <Label>
                    Occupation *
                  </Label>

                  <Select
                    value={form.occupation}
                    onValueChange={(value) =>
                      updateField(
                        "occupation",
                        value
                      )
                    }
                  >

                    <SelectTrigger>
                      <SelectValue placeholder="Select occupation" />
                    </SelectTrigger>

                    <SelectContent>

                      <SelectItem value="Market Developer">
                        Market Developer
                      </SelectItem>

                      <SelectItem value="Sales Assistant">
                        Sales Assistant
                      </SelectItem>

                      <SelectItem value="Sales Driver">
                        Sales Driver
                      </SelectItem>

                    </SelectContent>

                  </Select>

                </div>

                {/* WORK WEEK */}

                <div className="grid gap-2">

                  <Label>
                    Work Week *
                  </Label>

                  <Select
                    value={form.workWeek}
                    onValueChange={(value) =>
                      updateField(
                        "workWeek",
                        value
                      )
                    }
                  >

                    <SelectTrigger>
                      <SelectValue placeholder="Select work week" />
                    </SelectTrigger>

                    <SelectContent>

                      <SelectItem value="5_day">
                        5 Day Worker
                      </SelectItem>

                      <SelectItem value="6_day">
                        6 Day Worker
                      </SelectItem>

                    </SelectContent>

                  </Select>

                  {/* <p className="text-xs text-muted-foreground">
                    {/* Determines whether Saturday counts as a working day for attendance and leave. */}
                  {/* </p> */}

                </div>

                {/* FIRST NAME */}

                <div className="grid gap-2">

                  <Label htmlFor="firstName">
                    First Name *
                  </Label>

                  <Input
                    id="firstName"
                    value={
                      form.firstName
                    }
                    onChange={(event) =>
                      updateField(
                        "firstName",
                        event.target.value
                      )
                    }
                  />

                </div>

                {/* SURNAME */}

                <div className="grid gap-2">

                  <Label htmlFor="surname">
                    Surname *
                  </Label>

                  <Input
                    id="surname"
                    value={
                      form.surname
                    }
                    onChange={(event) =>
                      updateField(
                        "surname",
                        event.target.value
                      )
                    }
                  />

                </div>

                {/* ID NUMBER */}

                <div className="grid gap-2">

                  <Label htmlFor="idNumber">
                    ID Number
                  </Label>

                  <Input
                    id="idNumber"
                    value={
                      form.idNumber
                    }
                    onChange={(event) =>
                      updateField(
                        "idNumber",
                        event.target.value
                      )
                    }
                    maxLength={13}
                    inputMode="numeric"
                    placeholder="13 digit ID number"
                  />

                </div>

                {/* CELLPHONE */}

                <div className="grid gap-2">

                  <Label htmlFor="cellphone">
                    Cellphone
                  </Label>

                  <Input
                    id="cellphone"
                    value={
                      form.cellphone
                    }
                    onChange={(event) =>
                      updateField(
                        "cellphone",
                        event.target.value
                      )
                    }
                    inputMode="tel"
                    placeholder="e.g. 0821234567"
                  />

                </div>

                {/* DATE OF BIRTH */}

                <div className="grid gap-2">

                  <Label htmlFor="dateOfBirth">
                    Date of Birth
                  </Label>

                  <Input
                    id="dateOfBirth"
                    type="date"
                    value={
                      form.dateOfBirth
                    }
                    onChange={(event) =>
                      updateField(
                        "dateOfBirth",
                        event.target.value
                      )
                    }
                  />

                </div>

                {/* APPOINTMENT DATE */}

                <div className="grid gap-2">

                  <Label htmlFor="appointmentDate">
                    Appointment Date *
                  </Label>

                  <Input
                    id="appointmentDate"
                    type="date"
                    value={
                      form.appointmentDate
                    }
                    onChange={(event) =>
                      updateField(
                        "appointmentDate",
                        event.target.value
                      )
                    }
                  />

                </div>

                {/* STATUS */}

                <div className="grid gap-2 md:col-span-2">

                  <Label>
                    Status *
                  </Label>

                  <Select
                    value={form.status}
                    onValueChange={(value) =>
                      updateField(
                        "status",
                        value
                      )
                    }
                  >

                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>

                    <SelectContent>

                      <SelectItem value="employed">
                        Employed
                      </SelectItem>

                      <SelectItem value="terminated">
                        Terminated
                      </SelectItem>

                    </SelectContent>

                  </Select>

                </div>

              </div>

            </CardContent>

          </Card>

          {/* =================================================
              SAVE
          ================================================= */}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">

            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() =>
                router.push(
                  "/people"
                )
              }
            >
              Cancel
            </Button>

            <Button
              type="submit"
              disabled={
                saving ||
                loadingCompanies
              }
            >

              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}

              {saving
                ? "Saving Employee..."
                : "Add Employee"}

            </Button>

          </div>

        </div>

      </form>

    </div>
  );
}