"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import {
  ArrowLeft,
  Building2,
  Loader2,
  Lock,
  Save,
  UserRound,
} from "lucide-react";

import {
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
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

type EmployeeForm = {
  employeeCode: string;

  firstName: string;
  surname: string;

  edoId: string;
  edoName: string;
  site: string;

  occupation: string;

  // Employee working week:
  // 5_day = Monday-Friday
  // 6_day = Monday-Saturday
  workWeek: string;

  idNumber: string;
  cellphone: string;

  dateOfBirth: string;
  appointmentDate: string;

  status: string;

  terminationDate: string;
  terminationReason: string;
};

/* =========================================================
   INITIAL FORM
========================================================= */

const initialForm: EmployeeForm = {
  employeeCode: "",

  firstName: "",
  surname: "",

  edoId: "",
  edoName: "",
  site: "",

  occupation: "",
  workWeek: "",

  idNumber: "",
  cellphone: "",

  dateOfBirth: "",
  appointmentDate: "",

  status: "employed",

  terminationDate: "",
  terminationReason: "",
};

/* =========================================================
   HELPERS
========================================================= */

function clean(value: string) {
  return value.trim();
}

function employeeIsEdo(occupation: string) {
  return (
    occupation
      .trim()
      .toLowerCase() === "edo"
  );
}

/* =========================================================
   PAGE
========================================================= */

export default function EditEmployeePage() {
  const router = useRouter();
  const params = useParams();

  const employeeId =
    typeof params.employeeId === "string"
      ? params.employeeId
      : "";

  const [form, setForm] =
    useState<EmployeeForm>(initialForm);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  const [originalName, setOriginalName] =
    useState("");

  /* =======================================================
     LOAD EMPLOYEE
  ======================================================= */

  useEffect(() => {
    async function loadEmployee() {
      if (!employeeId) {
        setError(
          "Employee ID could not be determined."
        );

        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const employeeRef = doc(
          db,
          "employees",
          employeeId
        );

        const snapshot =
          await getDoc(employeeRef);

        if (!snapshot.exists()) {
          setError(
            "Employee could not be found."
          );

          return;
        }

        const data = snapshot.data();

        const firstName =
          data.firstName || "";

        const surname =
          data.surname || "";

        setOriginalName(
          `${firstName} ${surname}`.trim()
        );

        setForm({
          employeeCode:
            data.employeeCode || "",

          firstName,
          surname,

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
            data.status || "employed",

          terminationDate:
            data.terminationDate || "",

          terminationReason:
            data.terminationReason || "",
        });

      } catch (error) {
        console.error(
          "Error loading employee:",
          error
        );

        setError(
          "Unable to load employee details."
        );

      } finally {
        setLoading(false);
      }
    }

    loadEmployee();
  }, [employeeId]);

  /* =======================================================
     UPDATE FIELD
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
      Work Week is required for employees.

      EDO records don't require a work week because
      employee leave / attendance calculations don't
      apply to the EDO owner in the same way.
    */

    if (
      !employeeIsEdo(form.occupation) &&
      !form.workWeek
    ) {
      errors.push(
        "Work Week is required."
      );
    }

    if (!form.appointmentDate) {
      errors.push(
        "Appointment Date is required."
      );
    }

    const idNumber =
      clean(form.idNumber);

    if (
      idNumber &&
      !/^\d{13}$/.test(idNumber)
    ) {
      errors.push(
        "ID Number must contain 13 digits."
      );
    }

    if (
      form.status === "terminated" &&
      !form.terminationDate
    ) {
      errors.push(
        "Termination Date is required when an employee is terminated."
      );
    }

    if (
      form.status === "terminated" &&
      !clean(form.terminationReason)
    ) {
      errors.push(
        "Termination Reason is required when an employee is terminated."
      );
    }

    return errors;
  }

  /* =======================================================
     SAVE CHANGES
  ======================================================= */

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");

    const validationErrors =
      validateForm();

    if (
      validationErrors.length > 0
    ) {
      setError(
        validationErrors.join(" ")
      );

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });

      return;
    }

    const confirmed =
      window.confirm(
        `Save changes to ${clean(
          form.firstName
        )} ${clean(form.surname)}?`
      );

    if (!confirmed) {
      return;
    }

    try {
      setSaving(true);

      const employeeRef = doc(
        db,
        "employees",
        employeeId
      );

      await updateDoc(
        employeeRef,
        {
          firstName:
            clean(form.firstName),

          surname:
            clean(form.surname),

          occupation:
            clean(form.occupation),

          /*
            Store only the normalized Firebase value:
            5_day or 6_day.

            EDO records remain blank.
          */
          workWeek:
            employeeIsEdo(form.occupation)
              ? ""
              : form.workWeek,

          idNumber:
            clean(form.idNumber),

          cellphone:
            clean(form.cellphone),

          dateOfBirth:
            form.dateOfBirth || "",

          appointmentDate:
            form.appointmentDate,

          status:
            form.status,

          terminationDate:
            form.status === "terminated"
              ? form.terminationDate
              : null,

          terminationReason:
            form.status === "terminated"
              ? clean(
                  form.terminationReason
                )
              : null,

          lastUpdatedSource:
            "manual",

          updatedAt:
            serverTimestamp(),
        }
      );

      alert(
        `Employee updated successfully!\n\n` +
          `${clean(
            form.firstName
          )} ${clean(form.surname)}`
      );

      router.push("/people");

    } catch (error) {
      console.error(
        "Error updating employee:",
        error
      );

      setError(
        "Employee could not be updated. Please check the browser console for details."
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
     LOADING
  ======================================================= */

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">

        <div className="flex items-center gap-3 text-muted-foreground">

          <Loader2 className="h-5 w-5 animate-spin" />

          Loading employee...

        </div>

      </div>
    );
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
            Edit Employee
          </h1>

          <p className="text-muted-foreground">
            {originalName ||
              "Maintain employee information"}
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

      <form onSubmit={handleSubmit}>

        <div className="grid gap-6">

          {/* =================================================
              EMPLOYMENT IDENTITY
          ================================================= */}

          <Card>

            <CardHeader>

              <CardTitle className="flex items-center gap-2">

                <Building2 className="h-5 w-5" />

                Employment

              </CardTitle>

              <CardDescription>
                Employee Code and EDO Business are
                locked because they identify this
                employee in BizCentral.
              </CardDescription>

            </CardHeader>

            <CardContent>

              <div className="grid gap-5 md:grid-cols-2">

                {/* EDO BUSINESS */}

                <div className="grid gap-2">

                  <Label>
                    EDO Business
                  </Label>

                  <div className="flex min-h-10 items-center justify-between rounded-md border bg-muted/40 px-3 py-2">

                    <span className="text-sm font-medium">
                      {form.edoName || "—"}
                    </span>

                    <Lock className="h-4 w-4 text-muted-foreground" />

                  </div>

                </div>

                {/* SITE */}

                <div className="grid gap-2">

                  <Label>
                    Site
                  </Label>

                  <div className="flex min-h-10 items-center rounded-md border bg-muted/40 px-3 py-2 text-sm capitalize">
                    {form.site || "—"}
                  </div>

                </div>

                {/* EMPLOYEE CODE */}

                <div className="grid gap-2">

                  <Label>
                    Employee Code
                  </Label>

                  <div className="flex min-h-10 items-center justify-between rounded-md border bg-muted/40 px-3 py-2">

                    <span className="text-sm font-medium">
                      {form.employeeCode || "—"}
                    </span>

                    <Lock className="h-4 w-4 text-muted-foreground" />

                  </div>

                </div>

                {/* STATUS */}

                <div className="grid gap-2">

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
              PERSONAL / EMPLOYEE DETAILS
          ================================================= */}

          <Card>

            <CardHeader>

              <CardTitle className="flex items-center gap-2">

                <UserRound className="h-5 w-5" />

                Employee Details

              </CardTitle>

              <CardDescription>
                Update the employee&apos;s personal and
                employment information.
              </CardDescription>

            </CardHeader>

            <CardContent>

              <div className="grid gap-5 md:grid-cols-2">

                {/* FIRST NAME */}

                <div className="grid gap-2">

                  <Label htmlFor="firstName">
                    First Name *
                  </Label>

                  <Input
                    id="firstName"
                    value={form.firstName}
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
                    value={form.surname}
                    onChange={(event) =>
                      updateField(
                        "surname",
                        event.target.value
                      )
                    }
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

                      {form.occupation
                        .trim()
                        .toLowerCase() ===
                        "edo" && (
                        <SelectItem value="EDO">
                          EDO
                        </SelectItem>
                      )}

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
                    Work Week{" "}
                    {!employeeIsEdo(
                      form.occupation
                    ) && "*"}
                  </Label>

                  {employeeIsEdo(
                    form.occupation
                  ) ? (

                    <div className="flex min-h-10 items-center rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                      Not applicable to EDO
                    </div>

                  ) : (

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

                  )}

                  {!employeeIsEdo(
                    form.occupation
                  ) &&
                    !form.workWeek && (

                    <p className="text-xs text-amber-600">
                      Work week has not yet been set for this employee.
                    </p>

                  )}

                </div>

                {/* APPOINTMENT DATE */}

                <div className="grid gap-2">

                  <Label htmlFor="appointmentDate">
                    Appointment Date *
                  </Label>

                  <Input
                    id="appointmentDate"
                    type="date"
                    value={form.appointmentDate}
                    onChange={(event) =>
                      updateField(
                        "appointmentDate",
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
                    value={form.idNumber}
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
                    value={form.cellphone}
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

                {/* DOB */}

                <div className="grid gap-2">

                  <Label htmlFor="dateOfBirth">
                    Date of Birth
                  </Label>

                  <Input
                    id="dateOfBirth"
                    type="date"
                    value={form.dateOfBirth}
                    onChange={(event) =>
                      updateField(
                        "dateOfBirth",
                        event.target.value
                      )
                    }
                  />

                </div>

              </div>

            </CardContent>

          </Card>

          {/* =================================================
              TERMINATION DETAILS
          ================================================= */}

          {form.status === "terminated" && (

            <Card className="border-red-500/40">

              <CardHeader>

                <CardTitle className="text-red-700">
                  Termination Details
                </CardTitle>

                <CardDescription>
                  A terminated employee remains in
                  the employee history but no longer
                  counts toward the minimum employee
                  compliance requirement.
                </CardDescription>

              </CardHeader>

              <CardContent>

                <div className="grid gap-5 md:grid-cols-2">

                  <div className="grid gap-2">

                    <Label htmlFor="terminationDate">
                      Termination Date *
                    </Label>

                    <Input
                      id="terminationDate"
                      type="date"
                      value={form.terminationDate}
                      onChange={(event) =>
                        updateField(
                          "terminationDate",
                          event.target.value
                        )
                      }
                    />

                  </div>

                  <div className="grid gap-2">

                    <Label htmlFor="terminationReason">
                      Termination Reason *
                    </Label>

                    <Input
                      id="terminationReason"
                      value={form.terminationReason}
                      onChange={(event) =>
                        updateField(
                          "terminationReason",
                          event.target.value
                        )
                      }
                      placeholder="Reason for termination"
                    />

                  </div>

                </div>

              </CardContent>

            </Card>

          )}

          {/* =================================================
              ACTIONS
          ================================================= */}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">

            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() =>
                router.push("/people")
              }
            >
              Cancel
            </Button>

            <Button
              type="submit"
              disabled={saving}
            >

              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}

              {saving
                ? "Saving Changes..."
                : "Save Changes"}

            </Button>

          </div>

        </div>

      </form>

    </div>
  );
}