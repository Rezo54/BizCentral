"use client";

import { ChangeEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { AlertCircle, ArrowLeft, CheckCircle2, FileSpreadsheet, Upload, XCircle } from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type EdoCompany = { id: string; name: string; site: string; type?: string };
type EmployeeImportRow = {
  rowNumber: number; companyName: string; employeeCode: string; firstName: string; surname: string;
  occupation: string; workWeek: string; idNumber: string; cellphone: string; dateOfBirth: string;
  appointmentDate: string; status: string; terminationDate: string; terminationReason: string;
  edoId: string; site: string; valid: boolean; warnings: string[]; errors: string[];
};

function clean(value: unknown): string { return value == null ? "" : String(value).trim(); }
function normaliseCompanyName(value: string) { return value.trim().toLowerCase(); }
function normaliseStatus(value: string) { return value.trim().toLowerCase(); }
function normaliseWorkWeek(value: string): string {
  const v = value.trim().toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ");
  if (["5", "5 day", "5 days", "5 day worker", "5 days worker"].includes(v)) return "5_day";
  if (["6", "6 day", "6 days", "6 day worker", "6 days worker"].includes(v)) return "6_day";
  return "";
}
function excelDateToString(value: unknown): string {
  if (!value) return "";
  if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,"0")}-${String(value.getDate()).padStart(2,"0")}`;
  if (typeof value === "number") {
    const p = XLSX.SSF.parse_date_code(value);
    if (p) return `${p.y}-${String(p.m).padStart(2,"0")}-${String(p.d).padStart(2,"0")}`;
  }
  const text = String(value).trim();
  if (!text) return "";
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? text : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export default function EmployeeUploadPage() {
  const router = useRouter();
  const [rows, setRows] = useState<EmployeeImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [processing, setProcessing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  async function loadCompanies(): Promise<EdoCompany[]> {
    const snapshot = await getDocs(collection(db, "companies"));
    return snapshot.docs.map(d => {
      const x = d.data();
      return { id: x.id || d.id, name: clean(x.name), site: clean(x.site), type: clean(x.type) };
    }).filter(c => c.type === "edo");
  }

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setProcessing(true); setMessage(""); setRows([]); setFileName(file.name);
    try {
      const companies = await loadCompanies();
      const companyMap = new Map(companies.map(c => [normaliseCompanyName(c.name), c]));
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });
      const parsed: EmployeeImportRow[] = [];

      rawRows.forEach((raw, index) => {
        const n: Record<string, unknown> = {};
        Object.keys(raw).forEach(k => { n[k.trim().toLowerCase()] = raw[k]; });
        const companyName = clean(n["company name"]);
        const employeeCode = clean(n["employee code"]);
        let firstName = clean(n["first name"] || n["name"]);
        let surname = clean(n["surname"] || n["last name"]);
        const fullName = clean(n["employee name"]);
        if (!firstName && fullName) { const parts = fullName.split(/\s+/).filter(Boolean); firstName = parts.shift() || ""; if (!surname) surname = parts.join(" "); }
        const occupation = clean(n["occupation"]);
        const workWeek = normaliseWorkWeek(clean(n["work week"] ?? n["workweek"] ?? n["work week type"]));
        const idNumber = clean(n["id number"]);
        const cellphone = clean(n["cellphone"]);
        const dateOfBirth = excelDateToString(n["date of birth"]);
        const appointmentDate = excelDateToString(n["appointment date"] ?? n["date engaged"]);
        const status = normaliseStatus(clean(n["status"]));
        const terminationDate = excelDateToString(n["termination date"] ?? n["end date"]);
        const terminationReason = clean(n["termination reason"] ?? n["reason"]);
        if (!(employeeCode || firstName || surname || idNumber)) return;

        const errors: string[] = []; const warnings: string[] = [];
        const company = companyMap.get(normaliseCompanyName(companyName));
        if (!companyName) errors.push("Company Name missing"); else if (!company) errors.push("Company not found in BizCentral");
        if (!employeeCode) errors.push("Employee Code missing");
        if (!firstName) errors.push("First Name missing");
        if (!surname) errors.push("Surname missing");
        if (!occupation) errors.push("Occupation missing");
        if (!workWeek) errors.push("Work Week missing or invalid — use 5 Day or 6 Day");
        if (!appointmentDate) errors.push("Appointment Date missing");
        if (!status) errors.push("Status missing"); else if (!["employed","terminated"].includes(status)) errors.push(`Unknown status: ${status}`);
        if (status === "terminated" && !terminationDate) warnings.push("Terminated employee has no termination date");
        if (!idNumber) warnings.push("ID Number missing"); else if (!/^\d{13}$/.test(idNumber)) warnings.push("ID Number is not 13 digits");
        if (!cellphone) warnings.push("Cellphone missing");
        parsed.push({ rowNumber:index+2, companyName, employeeCode, firstName, surname, occupation, workWeek, idNumber, cellphone,
          dateOfBirth, appointmentDate, status, terminationDate, terminationReason, edoId:company?.id || "", site:company?.site || "",
          valid:errors.length===0, warnings, errors });
      });

      const counts = new Map<string, number>();
      parsed.forEach(r => { const k=`${r.edoId}|${r.employeeCode}`.toLowerCase(); counts.set(k,(counts.get(k)||0)+1); });
      parsed.forEach(r => { if ((counts.get(`${r.edoId}|${r.employeeCode}`.toLowerCase())||0)>1) { r.errors.push("Duplicate Employee Code in spreadsheet"); r.valid=false; } });
      setRows(parsed); setMessage(`Loaded ${parsed.length} employee records.`);
    } catch (e) { console.error(e); setMessage("Unable to read employee spreadsheet."); }
    finally { setProcessing(false); }
  }

  const validRows = useMemo(() => rows.filter(r=>r.valid), [rows]);
  const errorRows = useMemo(() => rows.filter(r=>!r.valid), [rows]);
  const warningRows = useMemo(() => rows.filter(r=>r.valid && r.warnings.length>0), [rows]);

  async function uploadEmployees() {
    if (!validRows.length || !window.confirm(`Upload ${validRows.length} valid employees to BizCentral?`)) return;
    setUploading(true); setMessage("");
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("You are not signed in.");
      const token = await user.getIdToken();
      const response = await fetch("/api/admin/employees/bulk", {
        method:"POST", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` },
        body:JSON.stringify({ rows: validRows.map(r => ({
          rowNumber:r.rowNumber, edoId:r.edoId, employeeCode:r.employeeCode, firstName:r.firstName, surname:r.surname,
          occupation:r.occupation, workWeek:r.workWeek, idNumber:r.idNumber, cellphone:r.cellphone, dateOfBirth:r.dateOfBirth,
          appointmentDate:r.appointmentDate, status:r.status, terminationDate:r.terminationDate, terminationReason:r.terminationReason,
        })) })
      });
      const result = await response.json().catch(()=>({}));
      if (!response.ok) throw new Error(result.error || "Employee bulk upload failed");
      alert(`Employee upload completed successfully!\n\n${result.processed} employee${result.processed===1?"":"s"} processed.\n${result.created} created, ${result.updated} updated.`);
      setMessage(`✓ Upload completed successfully — ${result.processed} processed (${result.created} created, ${result.updated} updated).`);
      window.scrollTo({top:0,behavior:"smooth"});
    } catch (e) {
      console.error("Employee upload error:",e);
      const text=e instanceof Error?e.message:"Employee upload failed";
      alert(text); setMessage(text); window.scrollTo({top:0,behavior:"smooth"});
    } finally { setUploading(false); }
  }

  return <div className="flex flex-col gap-8">
    <div className="flex items-center gap-4"><Button variant="outline" size="icon" onClick={()=>router.push("/people")}><ArrowLeft className="h-4 w-4"/></Button><div><h1 className="text-3xl font-bold tracking-tight">Bulk Employee Upload</h1><p className="text-muted-foreground">Import and validate employee master data before uploading it to BizCentral.</p></div></div>
    <Card><CardHeader><CardTitle>Employee Spreadsheet</CardTitle></CardHeader><CardContent><div className="flex flex-col gap-4 sm:flex-row sm:items-center"><label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"><FileSpreadsheet className="h-4 w-4"/>Select Excel File<input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="hidden"/></label>{fileName&&<span className="text-sm text-muted-foreground">{fileName}</span>}{processing&&<span className="text-sm">Reading spreadsheet...</span>}</div>{message&&<p className="mt-4 text-sm font-medium">{message}</p>}</CardContent></Card>
    {rows.length>0&&<><div className="grid gap-4 sm:grid-cols-3">
      <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5"/><div><p className="text-sm text-muted-foreground">Ready</p><p className="text-2xl font-bold">{validRows.length}</p></div></div></CardContent></Card>
      <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><AlertCircle className="h-5 w-5"/><div><p className="text-sm text-muted-foreground">Warnings</p><p className="text-2xl font-bold">{warningRows.length}</p></div></div></CardContent></Card>
      <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><XCircle className="h-5 w-5"/><div><p className="text-sm text-muted-foreground">Errors</p><p className="text-2xl font-bold">{errorRows.length}</p></div></div></CardContent></Card>
    </div><Card><CardHeader><CardTitle>Upload Preview</CardTitle></CardHeader><CardContent><div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Row</TableHead><TableHead>Company</TableHead><TableHead>Code</TableHead><TableHead>Employee</TableHead><TableHead>Occupation</TableHead><TableHead>Work Week</TableHead><TableHead>Appointment</TableHead><TableHead>Status</TableHead><TableHead>Validation</TableHead></TableRow></TableHeader><TableBody>{rows.map(r=><TableRow key={r.rowNumber}><TableCell>{r.rowNumber}</TableCell><TableCell><div>{r.companyName}</div>{r.edoId&&<div className="text-xs text-muted-foreground">{r.edoId}</div>}</TableCell><TableCell>{r.employeeCode}</TableCell><TableCell>{r.firstName} {r.surname}</TableCell><TableCell>{r.occupation||"—"}</TableCell><TableCell>{r.workWeek==="5_day"?"5 Day":r.workWeek==="6_day"?"6 Day":"—"}</TableCell><TableCell>{r.appointmentDate}</TableCell><TableCell><Badge variant="outline">{r.status||"—"}</Badge></TableCell><TableCell className="min-w-[260px]">{r.valid&&r.warnings.length===0&&<Badge>Ready</Badge>}{r.warnings.map((w,i)=><div key={`w-${i}`} className="text-sm">⚠ {w}</div>)}{r.errors.map((e,i)=><div key={`e-${i}`} className="text-sm text-destructive">✕ {e}</div>)}</TableCell></TableRow>)}</TableBody></Table></div><div className="mt-6 flex justify-end"><Button disabled={!validRows.length||uploading} onClick={uploadEmployees}><Upload className="mr-2 h-4 w-4"/>{uploading?"Uploading...":`Upload ${validRows.length} Valid Employees`}</Button></div></CardContent></Card></>}
  </div>;
}
