"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AlertCircle, ArrowLeft, CheckCircle2, FileText, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Company = { id: string; name: string; type: string };
type Employee = { id: string; employeeCode: string; idNumber: string; firstName: string; surname: string; edoId: string; occupation: string };
type PreviewRow = { page: number; employeeCode: string; idNumber: string; employeeName: string; payDate: string; payPeriod: string; periodLabel: string; netPay: string; annualLeave: string; ownerType: "employee" | "edo" | "unknown"; ownerId: string; matched: boolean; matchName: string; matchReason: string };

function cleanId(value: string) { return value.replace(/\D/g, ""); }
function monthLabel(period: string) { const [year, month] = period.split("-").map(Number); if (!year || !month) return "Unknown period"; return new Intl.DateTimeFormat("en-ZA", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1)); }
function extract(pattern: RegExp, text: string) { return text.match(pattern)?.[1]?.trim() || ""; }

function parsePage(page: number, text: string): PreviewRow {
  const employeeCode = extract(/Employee Code\s+([A-Za-z0-9_-]+)/i, text);
  const employeeName = extract(/Employee\s+(.+?)\s+Employee Code/i, text).replace(/\s*\([^)]*\)\s*$/, "").trim();
  const idNumber = cleanId(extract(/(?:ID(?:\s+Number|\s+No\.?|\s*#)?|Identity Number)\s*[:\-]?\s*([0-9][0-9\s-]{10,16})/i, text));
  const rawDate = extract(/Pay Date\s+(\d{4}[\/-]\d{2}[\/-]\d{2})/i, text);
  const payDate = rawDate.replaceAll("/", "-");
  const payPeriod = payDate ? payDate.slice(0, 7) : "";
  return { page, employeeCode, idNumber, employeeName, payDate, payPeriod, periodLabel: monthLabel(payPeriod), netPay: extract(/Nett pay\s+([\d\s,.]+)/i, text), annualLeave: extract(/Annual Leave\s+([\d.]+)/i, text), ownerType: "unknown", ownerId: "", matched: false, matchName: "", matchReason: "" };
}

async function readPdfPages(file: File): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // PDF.js requires an explicit worker location in a Next.js/browser build.
  // Using import.meta.url lets the bundler emit the worker with the application
  // instead of depending on an external CDN.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) { const page = await pdf.getPage(pageNumber); const content = await page.getTextContent(); pages.push(content.items.map((item: any) => ("str" in item ? item.str : "")).join(" ")); }
  return pages;
}

export default function PayslipImportPage() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true); const [allowed, setAllowed] = useState(false); const [accessMessage, setAccessMessage] = useState("");
  const [companies, setCompanies] = useState<Company[]>([]); const [employees, setEmployees] = useState<Employee[]>([]); const [companyId, setCompanyId] = useState("");
  const [fileName, setFileName] = useState(""); const [processing, setProcessing] = useState(false); const [rows, setRows] = useState<PreviewRow[]>([]); const [error, setError] = useState("");

  useEffect(() => { const auth = getAuth(); const unsubscribe = onAuthStateChanged(auth, async (user) => {
    if (!user) { setAccessMessage("You must be signed in."); setCheckingAccess(false); return; }
    try {
      const accessSnap = await getDoc(doc(db, "userAccess", user.uid)); if (!accessSnap.exists()) throw new Error("No userAccess record found. Run User Access Sync first.");
      const access = accessSnap.data(); const userType = String(access.userType || "").toLowerCase(); const accountRole = String(access.accountRole || "").toLowerCase(); const accessLevel = String(access.accessLevel || "").toLowerCase(); const status = String(access.status || "").toLowerCase();
      const isSuperAdmin = accessLevel === "superadmin" || accessLevel === "super_admin"; const canImport = status === "approved" && ((userType === "taskraft" && accountRole === "accountant") || isSuperAdmin);
      if (!canImport) { setAccessMessage("Payslip Import is restricted to approved Taskraft accountant accounts."); setCheckingAccess(false); return; }
      setAllowed(true);
      const [companySnap, employeeSnap] = await Promise.all([getDocs(collection(db, "companies")), getDocs(collection(db, "employees"))]);
      setCompanies(companySnap.docs.map((d) => ({ id: String(d.data().id || d.id), name: String(d.data().name || ""), type: String(d.data().type || "") })).filter((c) => c.type.toLowerCase() === "edo").sort((a, b) => a.name.localeCompare(b.name)));
      setEmployees(employeeSnap.docs.map((d) => ({ id: d.id, employeeCode: String(d.data().employeeCode || "").trim(), idNumber: cleanId(String(d.data().idNumber || "")), firstName: String(d.data().firstName || ""), surname: String(d.data().surname || ""), edoId: String(d.data().edoId || ""), occupation: String(d.data().occupation || "") })));
    } catch (e) { setAccessMessage(e instanceof Error ? e.message : "Unable to verify access."); } finally { setCheckingAccess(false); }
  }); return unsubscribe; }, []);

  const selectedCompany = useMemo(() => companies.find((c) => c.id === companyId), [companies, companyId]);

  async function handlePdf(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return; setFileName(file.name); setRows([]); setError("");
    if (!companyId) { setError("Select the EDO company before choosing the payslip PDF."); event.target.value = ""; return; }
    try {
      setProcessing(true); const pageTexts = await readPdfPages(file); const parsed = pageTexts.map((text, index) => parsePage(index + 1, text)); const companyEmployees = employees.filter((e) => e.edoId === companyId);
      const matched = parsed.map((row) => {
        const codeMatches = companyEmployees.filter((e) => e.employeeCode.toLowerCase() === row.employeeCode.toLowerCase());
        const exact = row.idNumber ? codeMatches.find((e) => e.idNumber && e.idNumber === row.idNumber) : undefined;
        if (exact) return { ...row, ownerType: "employee" as const, ownerId: exact.id, matched: true, matchName: `${exact.firstName} ${exact.surname}`.trim(), matchReason: "Employee number + ID number" };
        if (codeMatches.length === 1 && !row.idNumber) return { ...row, matchName: `${codeMatches[0].firstName} ${codeMatches[0].surname}`.trim(), matchReason: "Employee number found, but ID number was not detected on payslip" };
        const looksLikeEdo = /director/i.test(pageTexts[row.page - 1]);
        if (looksLikeEdo) return { ...row, ownerType: "edo" as const, ownerId: companyId, matched: false, matchName: `${selectedCompany?.name || "EDO"} (Director)`, matchReason: "EDO page detected; employee number + ID verification still required before storage" };
        return { ...row, matchReason: codeMatches.length ? "Employee number found but ID number does not match" : "Employee number not found for selected EDO" };
      });
      setRows(matched);
    } catch (e) { console.error("Payslip PDF preview failed:", e); setError(e instanceof Error ? e.message : "Could not read this PDF."); } finally { setProcessing(false); event.target.value = ""; }
  }

  if (checkingAccess) return <div className="p-6 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Checking payslip access...</div>;
  if (!allowed) return <div className="p-6 max-w-2xl"><Card><CardHeader><CardTitle className="flex items-center gap-2"><AlertCircle className="h-5 w-5" /> Access restricted</CardTitle><CardDescription>{accessMessage}</CardDescription></CardHeader></Card></div>;

  return <div className="flex flex-col gap-6">
    <div><Button variant="ghost" className="mb-2 px-0" onClick={() => router.push("/people")}><ArrowLeft className="mr-2 h-4 w-4" /> Back to People</Button><h1 className="text-3xl font-bold tracking-tight">Payslip Import</h1><p className="text-muted-foreground">Upload a combined Sage payslip PDF. A payslip is only marked Ready when both employee number and ID number match the selected EDO's record.</p></div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> Upload payslips</CardTitle><CardDescription>Preview-only while we validate Sage extraction and dual-identifier matching.</CardDescription></CardHeader><CardContent className="space-y-5">
      <div><label className="mb-2 block text-sm font-medium">EDO company</label><select className="w-full max-w-xl rounded-md border bg-background px-3 py-2 text-sm" value={companyId} onChange={(e) => { setCompanyId(e.target.value); setRows([]); setFileName(""); }}><option value="">Select EDO company...</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></div>
      <div><label className="mb-2 block text-sm font-medium">Sage payslip PDF</label><input type="file" accept="application/pdf,.pdf" onChange={handlePdf} disabled={!companyId || processing} className="block w-full max-w-xl text-sm" />{fileName && <div className="mt-2 text-sm text-muted-foreground"><FileText className="mr-1 inline h-4 w-4" />{fileName}</div>}</div>
      {processing && <div className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Reading payslip pages...</div>}{error && <div className="rounded-md border border-red-500/40 bg-red-500/5 p-3 text-sm text-red-700">{error}</div>}
    </CardContent></Card>
    {rows.length > 0 && <Card><CardHeader><CardTitle>Import preview</CardTitle><CardDescription>{rows.length} payslip page{rows.length === 1 ? "" : "s"} detected. Nothing has been saved yet.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Page</th><th className="p-2">Employee #</th><th className="p-2">ID number</th><th className="p-2">Payslip name</th><th className="p-2">Matched to</th><th className="p-2">Period</th><th className="p-2 text-right">Net pay</th><th className="p-2 text-right">Annual leave</th><th className="p-2">Status</th></tr></thead><tbody>{rows.map((row) => <tr key={row.page} className="border-b align-top"><td className="p-2">{row.page}</td><td className="p-2 font-medium">{row.employeeCode || "—"}</td><td className="p-2">{row.idNumber || "Not detected"}</td><td className="p-2">{row.employeeName || "—"}</td><td className="p-2"><div>{row.matchName || "No match"}</div><div className="text-xs text-muted-foreground">{row.matchReason}</div></td><td className="p-2"><div>{row.periodLabel}</div><div className="text-xs text-muted-foreground">{row.payDate || "No pay date"}</div></td><td className="p-2 text-right">{row.netPay ? `R ${row.netPay}` : "—"}</td><td className="p-2 text-right">{row.annualLeave || "—"}</td><td className="p-2">{row.matched && row.payPeriod ? <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" /> Ready</Badge> : <Badge variant="destructive">Review</Badge>}</td></tr>)}</tbody></table></div><div className="mt-5 rounded-md border bg-muted/30 p-4 text-sm"><strong>Matching rule:</strong> employee number and South African ID number must both agree before an employee payslip can be imported. This prevents a duplicated or incorrectly assigned employee code from attaching payroll data to the wrong person.</div></CardContent></Card>}
  </div>;
}
