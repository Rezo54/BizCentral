"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, Loader2, Save, UserPlus } from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type EdoCompany = { id: string; name: string; site: string };
type EmployeeForm = {
  edoId: string; employeeCode: string; firstName: string; surname: string;
  occupation: string; workWeek: string; idNumber: string; cellphone: string;
  dateOfBirth: string; appointmentDate: string; status: string;
};

const initialForm: EmployeeForm = {
  edoId: "", employeeCode: "", firstName: "", surname: "", occupation: "",
  workWeek: "", idNumber: "", cellphone: "", dateOfBirth: "",
  appointmentDate: "", status: "employed",
};

const clean = (value: string) => value.trim();

export default function AddEmployeePage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<EdoCompany[]>([]);
  const [form, setForm] = useState<EmployeeForm>(initialForm);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadCompanies() {
      try {
        setLoadingCompanies(true);
        const snapshot = await getDocs(collection(db, "companies"));
        setCompanies(snapshot.docs.map((d) => {
          const data = d.data();
          return { id: data.id || d.id, name: data.name || "", site: data.site || "", type: data.type || "" };
        }).filter((c: any) => c.type === "edo").sort((a, b) => a.name.localeCompare(b.name)));
      } catch (e) {
        console.error(e);
        setError("Unable to load EDO businesses.");
      } finally { setLoadingCompanies(false); }
    }
    loadCompanies();
  }, []);

  const selectedCompany = useMemo(() => companies.find((c) => c.id === form.edoId), [companies, form.edoId]);
  const updateField = (field: keyof EmployeeForm, value: string) => setForm((current) => ({ ...current, [field]: value }));

  function validateForm() {
    const errors: string[] = [];
    if (!form.edoId) errors.push("Please select an EDO business.");
    if (!clean(form.employeeCode)) errors.push("Employee Code is required.");
    if (!clean(form.firstName)) errors.push("First Name is required.");
    if (!clean(form.surname)) errors.push("Surname is required.");
    if (!clean(form.occupation)) errors.push("Occupation is required.");
    if (!form.workWeek) errors.push("Work Week is required.");
    if (!form.appointmentDate) errors.push("Appointment Date is required.");
    if (clean(form.idNumber) && !/^\d{13}$/.test(clean(form.idNumber))) errors.push("ID Number must contain 13 digits.");
    return errors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const validationErrors = validateForm();
    if (validationErrors.length) { setError(validationErrors.join(" ")); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (!selectedCompany) { setError("The selected EDO business could not be found."); return; }
    if (!window.confirm(`Add ${clean(form.firstName)} ${clean(form.surname)} to ${selectedCompany.name}?`)) return;

    try {
      setSaving(true);
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) throw new Error("Your login session is no longer available. Please sign in again.");
      const idToken = await firebaseUser.getIdToken();
      const response = await fetch("/api/admin/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify(form),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Employee could not be added.");
      alert(`Employee added successfully!\n\n${clean(form.firstName)} ${clean(form.surname)}\n${selectedCompany.name}\n${form.workWeek === "6_day" ? "6 Day Worker" : "5 Day Worker"}`);
      router.push("/people");
    } catch (e) {
      console.error("Error adding employee:", e);
      setError(e instanceof Error ? e.message : "Employee could not be added.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally { setSaving(false); }
  }

  return <div className="flex flex-col gap-8">
    <div className="flex items-center gap-4">
      <Button variant="outline" size="icon" type="button" onClick={() => router.push("/people")}><ArrowLeft className="h-4 w-4" /></Button>
      <div><h1 className="text-3xl font-bold tracking-tight">Add Employee</h1><p className="text-muted-foreground">Add an individual employee to an EDO business.</p></div>
    </div>
    {error && <div className="rounded-md border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-700">{error}</div>}
    <form onSubmit={handleSubmit}><div className="grid gap-6">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />EDO Business</CardTitle><CardDescription>Select the business this employee belongs to. The site will be assigned automatically by the server.</CardDescription></CardHeader>
        <CardContent className="space-y-5"><div className="grid gap-2"><Label>EDO Business *</Label><Select value={form.edoId} onValueChange={(v) => updateField("edoId", v)} disabled={loadingCompanies}><SelectTrigger><SelectValue placeholder={loadingCompanies ? "Loading EDO businesses..." : "Select EDO business"} /></SelectTrigger><SelectContent>{companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>{selectedCompany && <div className="rounded-md border bg-muted/30 p-4"><div className="text-xs text-muted-foreground">Site</div><div className="mt-1 font-medium capitalize">{selectedCompany.site || "No site assigned"}</div></div>}</CardContent>
      </Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5" />Employee Details</CardTitle><CardDescription>Capture the employee&apos;s master information.</CardDescription></CardHeader>
        <CardContent><div className="grid gap-5 md:grid-cols-2">
          <div className="grid gap-2"><Label>Employee Code *</Label><Input value={form.employeeCode} onChange={(e) => updateField("employeeCode", e.target.value)} placeholder="e.g. BG005" /></div>
          <div className="grid gap-2"><Label>Occupation *</Label><Select value={form.occupation} onValueChange={(v) => updateField("occupation", v)}><SelectTrigger><SelectValue placeholder="Select occupation" /></SelectTrigger><SelectContent><SelectItem value="Market Developer">Market Developer</SelectItem><SelectItem value="Sales Assistant">Sales Assistant</SelectItem><SelectItem value="Sales Driver">Sales Driver</SelectItem></SelectContent></Select></div>
          <div className="grid gap-2"><Label>Work Week *</Label><Select value={form.workWeek} onValueChange={(v) => updateField("workWeek", v)}><SelectTrigger><SelectValue placeholder="Select work week" /></SelectTrigger><SelectContent><SelectItem value="5_day">5 Day Worker</SelectItem><SelectItem value="6_day">6 Day Worker</SelectItem></SelectContent></Select></div>
          <div className="grid gap-2"><Label>First Name *</Label><Input value={form.firstName} onChange={(e) => updateField("firstName", e.target.value)} /></div>
          <div className="grid gap-2"><Label>Surname *</Label><Input value={form.surname} onChange={(e) => updateField("surname", e.target.value)} /></div>
          <div className="grid gap-2"><Label>ID Number</Label><Input value={form.idNumber} onChange={(e) => updateField("idNumber", e.target.value)} maxLength={13} inputMode="numeric" placeholder="13 digit ID number" /></div>
          <div className="grid gap-2"><Label>Cellphone</Label><Input value={form.cellphone} onChange={(e) => updateField("cellphone", e.target.value)} inputMode="tel" placeholder="e.g. 0821234567" /></div>
          <div className="grid gap-2"><Label>Date of Birth</Label><Input type="date" value={form.dateOfBirth} onChange={(e) => updateField("dateOfBirth", e.target.value)} /></div>
          <div className="grid gap-2"><Label>Appointment Date *</Label><Input type="date" value={form.appointmentDate} onChange={(e) => updateField("appointmentDate", e.target.value)} /></div>
          <div className="grid gap-2 md:col-span-2"><Label>Status *</Label><Select value={form.status} onValueChange={(v) => updateField("status", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="employed">Employed</SelectItem><SelectItem value="terminated">Terminated</SelectItem></SelectContent></Select></div>
        </div></CardContent>
      </Card>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button type="button" variant="outline" disabled={saving} onClick={() => router.push("/people")}>Cancel</Button><Button type="submit" disabled={saving || loadingCompanies}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}{saving ? "Saving Employee..." : "Add Employee"}</Button></div>
    </div></form>
  </div>;
}
