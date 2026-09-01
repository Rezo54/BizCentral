'use client';

import Link from 'next/link';
import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { collection, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { ArrowLeft, CheckCircle2, FileSpreadsheet, Loader2, Upload, XCircle } from 'lucide-react';
import { db } from '@/lib/firebase';
import { getCurrentUser, SessionUser } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import NoAccess from '@/components/no-access';

type RouteInfo = { id: string; routeNo: string; edoId: string; description?: string };
type ReconRow = {
  routeNo: string; sourceName: string; routeId?: string; edoId?: string; matched: boolean;
  reconDate: string; allowance: number; previousOutstanding: number; issuedToday: number; returnedToday: number; currentOutstanding: number;
  dollyPreviousOutstanding: number; dollyIssuedToday: number; dollyReturnedToday: number; dollyCurrentOutstanding: number;
};

type ParsedSheetRow = { routeNo: string; sourceName: string; allowance?: number; previousOutstanding: number; issuedToday: number; returnedToday: number; currentOutstanding: number };

const iso = (v: unknown) => {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;
  if (typeof v === 'number') { const d = XLSX.SSF.parse_date_code(v); if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`; }
  const s = String(v ?? '').trim();
  const d = new Date(s); return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const outstanding = (v: unknown) => Math.abs(num(v));
const routeKey = (v: unknown) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, '');
const docSafe = (v: string) => v.replace(/[^A-Za-z0-9_-]/g, '-');

function findDateGroup(rows: unknown[][], selectedDate: string, startCol: number) {
  const headers = rows[3] || [];
  for (let c = startCol; c < headers.length; c++) if (iso(headers[c]) === selectedDate) return c;
  return -1;
}

function availableDates(rows: unknown[][], startCol: number) {
  const set = new Set<string>();
  const headers = rows[3] || [];
  for (let c = startCol; c < headers.length; c++) { const d = iso(headers[c]); if (d) set.add(d); }
  return [...set].sort();
}

function parseSheet(rows: unknown[][], selectedDate: string, kind: 'crate'|'dolly'): ParsedSheetRow[] {
  const start = kind === 'crate' ? 4 : 3;
  const c = findDateGroup(rows, selectedDate, start);
  if (c < 0) return [];
  const previousAccCol = c - 1;
  const result: ParsedSheetRow[] = [];
  for (let r = 4; r < rows.length; r++) {
    const row = rows[r] || [];
    const routeNo = String(row[0] ?? '').trim();
    if (!routeNo || !/^R/i.test(routeNo)) continue;
    const sourceName = String(row[1] ?? '').trim();
    const openingCol = kind === 'crate' ? 3 : 2;
    const rawPrevious = previousAccCol >= start ? row[previousAccCol] : row[openingCol];
    const rawCurrent = row[c + 3];
    result.push({
      routeNo, sourceName,
      allowance: kind === 'crate' ? Math.max(0, num(row[2])) : undefined,
      previousOutstanding: outstanding(rawPrevious),
      issuedToday: Math.max(0, num(row[c])),
      returnedToday: Math.max(0, num(row[c + 1])),
      currentOutstanding: outstanding(rawCurrent),
    });
  }
  return result;
}

export default function PremierReconUploadPage() {
  const [user,setUser] = useState<SessionUser|null>(null); const [authLoading,setAuthLoading] = useState(true);
  const [routes,setRoutes] = useState<RouteInfo[]>([]); const [workbook,setWorkbook] = useState<XLSX.WorkBook|null>(null);
  const [fileName,setFileName] = useState(''); const [dates,setDates] = useState<string[]>([]); const [selectedDate,setSelectedDate] = useState('');
  const [rows,setRows] = useState<ReconRow[]>([]); const [message,setMessage] = useState(''); const [importing,setImporting] = useState(false);

  useEffect(()=>{(async()=>{try{const u=await getCurrentUser();setUser(u);if(u?.userType==='taskraft'){const snap=await getDocs(collection(db,'routes'));setRoutes(snap.docs.map(d=>{const x=d.data();return{id:d.id,routeNo:String(x.routeNo??''),edoId:String(x.edoId??''),description:x.description};}));}}finally{setAuthLoading(false)}})()},[]);

  function parseWorkbook(wb:XLSX.WorkBook,date:string){
    const cs=wb.Sheets['Own Routes Crates'], ds=wb.Sheets['Own Routes Dollies'];
    if(!cs||!ds){setRows([]);setMessage('Workbook must contain Own Routes Crates and Own Routes Dollies sheets.');return;}
    const crates=XLSX.utils.sheet_to_json<unknown[]>(cs,{header:1,raw:false,defval:null});
    const dollies=XLSX.utils.sheet_to_json<unknown[]>(ds,{header:1,raw:false,defval:null});
    const cr=parseSheet(crates,date,'crate'), dr=parseSheet(dollies,date,'dolly'); const dm=new Map(dr.map(x=>[routeKey(x.routeNo),x]));
    const rm=new Map(routes.map(x=>[routeKey(x.routeNo),x]));
    setRows(cr.map(c=>{const d=dm.get(routeKey(c.routeNo));const route=rm.get(routeKey(c.routeNo));return{routeNo:c.routeNo,sourceName:c.sourceName,routeId:route?.id,edoId:route?.edoId,matched:!!route,reconDate:date,allowance:c.allowance??0,previousOutstanding:c.previousOutstanding,issuedToday:c.issuedToday,returnedToday:c.returnedToday,currentOutstanding:c.currentOutstanding,dollyPreviousOutstanding:d?.previousOutstanding??0,dollyIssuedToday:d?.issuedToday??0,dollyReturnedToday:d?.returnedToday??0,dollyCurrentOutstanding:d?.currentOutstanding??0};}));
    setMessage('');
  }

  async function onFile(e:ChangeEvent<HTMLInputElement>){const f=e.target.files?.[0];if(!f)return;setMessage('');setRows([]);const data=await f.arrayBuffer();const wb=XLSX.read(data,{type:'array',cellDates:true});const cs=wb.Sheets['Own Routes Crates'];if(!cs){setMessage('Own Routes Crates sheet not found.');return;}const ar=XLSX.utils.sheet_to_json<unknown[]>(cs,{header:1,raw:false,defval:null});const ds=availableDates(ar,4);setWorkbook(wb);setFileName(f.name);setDates(ds);const latest=ds[ds.length-1]||'';setSelectedDate(latest);if(latest)parseWorkbook(wb,latest);else setMessage('No reconciliation dates were found in row 4 of Own Routes Crates.');}
  function changeDate(v:string){setSelectedDate(v);if(workbook)parseWorkbook(workbook,v);}

  const matched=rows.filter(r=>r.matched).length, unmatched=rows.length-matched;
  const canImport=rows.length>0&&unmatched===0&&!!user&&user.userType==='taskraft';

  async function importRecon(){if(!canImport||!user)return;setImporting(true);setMessage('');try{for(const r of rows){const id=`${docSafe(r.routeNo)}_${r.reconDate}`;await setDoc(doc(db,'crateReconDaily',id),{routeNo:r.routeNo,routeId:r.routeId,edoId:r.edoId,sourceName:r.sourceName,reconDate:r.reconDate,crate:{allowance:r.allowance,previousOutstanding:r.previousOutstanding,issuedToday:r.issuedToday,returnedToday:r.returnedToday,currentOutstanding:r.currentOutstanding},dolly:{previousOutstanding:r.dollyPreviousOutstanding,issuedToday:r.dollyIssuedToday,returnedToday:r.dollyReturnedToday,currentOutstanding:r.dollyCurrentOutstanding},source:'premier_recon',sourceFileName:fileName,importedAt:serverTimestamp(),importedBy:user.uid,importedByName:user.name},{merge:true});}setMessage(`Imported ${rows.length} route reconciliation records for ${selectedDate}. Re-importing this date updates the same route/date records.`);}catch(e){setMessage(e instanceof Error?e.message:'Import failed.');}finally{setImporting(false)}}

  if(authLoading)return <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin"/></div>;
  if(!user||user.userType!=='taskraft')return <NoAccess/>;

  return <div className="space-y-6"><Button asChild variant="ghost" className="-ml-3"><Link href="/accounting/crate-control"><ArrowLeft className="mr-2 h-4 w-4"/>Back to Crate & Dolly Control</Link></Button><div><h1 className="text-3xl font-bold">Upload Premier Crate Recon</h1><p className="text-muted-foreground">Import the official Premier Own Routes Crates and Own Routes Dollies reconciliation workbook.</p></div>
    <Card><CardHeader><CardTitle>Select Premier Workbook</CardTitle><CardDescription>The importer reads the existing Premier sheet layout. Nothing is saved until you review the preview and click Import Reconciliation.</CardDescription></CardHeader><CardContent className="space-y-4"><label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed p-5 hover:bg-muted/40"><FileSpreadsheet className="h-7 w-7"/><div className="flex-1"><div className="font-medium">{fileName||'Choose .xlsx / .xls file'}</div><div className="text-sm text-muted-foreground">Expected sheets: Own Routes Crates and Own Routes Dollies</div></div><input className="hidden" type="file" accept=".xlsx,.xls" onChange={onFile}/></label>{dates.length>0&&<div className="max-w-xs"><label className="text-sm font-medium">Reconciliation date</label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={selectedDate} onChange={e=>changeDate(e.target.value)}>{[...dates].reverse().map(d=><option key={d} value={d}>{d}</option>)}</select></div>}{message&&<div className="rounded-lg border bg-muted/40 p-3 text-sm">{message}</div>}</CardContent></Card>
    {rows.length>0&&<><div className="grid gap-4 sm:grid-cols-3"><Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Premier Routes</div><div className="text-3xl font-bold">{rows.length}</div></CardContent></Card><Card><CardContent className="pt-6"><div className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-emerald-600"/>Matched to BizCentral</div><div className="text-3xl font-bold text-emerald-700">{matched}</div></CardContent></Card><Card><CardContent className="pt-6"><div className="flex items-center gap-2 text-sm text-muted-foreground"><XCircle className="h-4 w-4 text-red-600"/>Unmatched Routes</div><div className={`text-3xl font-bold ${unmatched?'text-red-700':'text-emerald-700'}`}>{unmatched}</div></CardContent></Card></div>
      <Card><CardHeader><CardTitle>Import Preview — {selectedDate}</CardTitle><CardDescription>Previous outstanding is the prior accumulated balance. Today's OUT/IN remain operational movements. Current outstanding is the selected day's accumulated balance.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-sm"><thead><tr className="border-b bg-muted/40"><th className="p-3 text-left">Route</th><th className="text-left">Premier Name</th><th className="text-center">Match</th><th className="text-right">Allowance</th><th className="text-right">Previous</th><th className="text-right">OUT</th><th className="text-right">IN</th><th className="text-right">Current</th><th className="text-right">Dolly Previous</th><th className="text-right">Dolly OUT</th><th className="text-right">Dolly IN</th><th className="pr-3 text-right">Dolly Current</th></tr></thead><tbody>{rows.map(r=><tr key={r.routeNo} className="border-b"><td className="p-3 font-medium">{r.routeNo}</td><td>{r.sourceName}</td><td className="text-center">{r.matched?<span className="font-semibold text-emerald-700">Matched</span>:<span className="font-semibold text-red-700">Unmatched</span>}</td><td className="text-right">{r.allowance}</td><td className="text-right">{r.previousOutstanding}</td><td className="text-right">{r.issuedToday}</td><td className="text-right">{r.returnedToday}</td><td className="text-right font-semibold">{r.currentOutstanding}</td><td className="text-right">{r.dollyPreviousOutstanding}</td><td className="text-right">{r.dollyIssuedToday}</td><td className="text-right">{r.dollyReturnedToday}</td><td className="pr-3 text-right font-semibold">{r.dollyCurrentOutstanding}</td></tr>)}</tbody></table></div><div className="mt-5 flex flex-wrap items-center gap-3"><Button onClick={importRecon} disabled={!canImport||importing}>{importing?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Upload className="mr-2 h-4 w-4"/>}Import Reconciliation</Button>{unmatched>0&&<span className="text-sm text-red-700">Resolve all unmatched routes before importing. No partial import will be performed.</span>}</div></CardContent></Card></>}
  </div>;
}
