'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { ArrowLeft, ExternalLink, FileText, Loader2 } from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type LeaveRequest = {
  id:string; employeeName:string; employeeCode:string; edoName:string; edoId:string;
  leaveType:string; fromDate:string; toDate:string; days:number; status:string;
  documentName:string; documentPath:string;
};

type UserAccess = { userType:string; companyId:string|null; status:string };

const leaveLabel:Record<string,string>={annual_leave:'Annual Leave',sick_leave:'Sick Leave',family_responsibility:'Family Responsibility',unpaid_leave:'Unpaid Leave'};
function fmt(v:string){if(!v)return '—';const[y,m,d]=v.split('-');return `${d}/${m}/${y}`}

export default function LeaveDocumentReviewPage(){
  const[rows,setRows]=useState<LeaveRequest[]>([]);const[loading,setLoading]=useState(true);const[opening,setOpening]=useState('');const[error,setError]=useState('');
  useEffect(()=>onAuthStateChanged(auth,async user=>{if(!user){setError('You must be signed in.');setLoading(false);return}try{
    const accessSnap=await getDocs(query(collection(db,'userAccess'),where('uid','==',user.uid)));
    let access:UserAccess|null=null;
    if(!accessSnap.empty){const a=accessSnap.docs[0].data();access={userType:String(a.userType||'').toLowerCase(),companyId:a.companyId?String(a.companyId):null,status:String(a.status||'').toLowerCase()}}
    if(!access){const {doc,getDoc}=await import('firebase/firestore');const s=await getDoc(doc(db,'userAccess',user.uid));if(s.exists()){const a=s.data();access={userType:String(a.userType||'').toLowerCase(),companyId:a.companyId?String(a.companyId):null,status:String(a.status||'').toLowerCase()}}}
    if(!access||access.status!=='approved')throw new Error('Approved BizCentral access is required.');
    const ref=collection(db,'leaveRequests');const snap=await getDocs(access.userType==='edo'&&access.companyId?query(ref,where('edoId','==',access.companyId)):ref);
    const data=snap.docs.map(s=>{const d=s.data();return{id:s.id,employeeName:String(d.employeeName||''),employeeCode:String(d.employeeCode||''),edoName:String(d.edoName||''),edoId:String(d.edoId||''),leaveType:String(d.leaveType||''),fromDate:String(d.fromDate||''),toDate:String(d.toDate||''),days:Number(d.days||0),status:String(d.status||'pending'),documentName:String(d.documentName||''),documentPath:String(d.documentPath||'')}}).filter(r=>r.documentPath).sort((a,b)=>b.fromDate.localeCompare(a.fromDate));setRows(data);
  }catch(e){setError(e instanceof Error?e.message:'Unable to load leave documents.')}finally{setLoading(false)}}),[]);
  async function openDocument(row:LeaveRequest){try{setOpening(row.id);setError('');const user=auth.currentUser;if(!user)throw new Error('Your session has expired.');const token=await user.getIdToken();const r=await fetch(`/api/admin/leave-document?requestId=${encodeURIComponent(row.id)}`,{headers:{Authorization:`Bearer ${token}`}});const j=await r.json();if(!r.ok||!j?.url)throw new Error(j?.message||'Unable to open attachment.');window.open(j.url,'_blank','noopener,noreferrer')}catch(e){setError(e instanceof Error?e.message:'Unable to open attachment.')}finally{setOpening('')}}
  return <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6"><div><Button variant="ghost" className="mb-3 px-0" asChild><Link href="/people/leave"><ArrowLeft className="mr-2 h-4 w-4"/>Back to Leave Management</Link></Button><h1 className="text-2xl font-bold">Leave Supporting Documents</h1><p className="mt-1 text-sm text-muted-foreground">Open documents submitted with employee leave applications.</p></div>{error&&<div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}{loading?<div className="flex items-center gap-2 rounded-xl border bg-background p-5"><Loader2 className="h-4 w-4 animate-spin"/>Loading attachments...</div>:rows.length===0?<div className="rounded-xl border bg-background p-6 text-sm text-muted-foreground">No leave applications with supporting documents found.</div>:<div className="overflow-x-auto rounded-xl border bg-background"><table className="w-full text-sm"><thead className="border-b bg-muted/40"><tr><th className="p-3 text-left">Employee</th><th className="p-3 text-left">EDO Business</th><th className="p-3 text-left">Leave</th><th className="p-3 text-left">Dates</th><th className="p-3 text-left">Status</th><th className="p-3 text-left">Attachment</th></tr></thead><tbody>{rows.map(row=><tr key={row.id} className="border-b last:border-0"><td className="p-3"><div className="font-medium">{row.employeeName}</div><div className="text-xs text-muted-foreground">{row.employeeCode}</div></td><td className="p-3">{row.edoName}</td><td className="p-3"><div>{leaveLabel[row.leaveType]||row.leaveType}</div><div className="text-xs text-muted-foreground">{row.days} day{row.days===1?'':'s'}</div></td><td className="p-3">{fmt(row.fromDate)} — {fmt(row.toDate)}</td><td className="p-3"><Badge variant={row.status==='rejected'?'destructive':'secondary'} className={row.status==='approved'?'bg-green-600 text-white':''}>{row.status}</Badge></td><td className="p-3"><Button size="sm" variant="outline" disabled={opening===row.id} onClick={()=>openDocument(row)}>{opening===row.id?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<FileText className="mr-2 h-4 w-4"/>}{row.documentName||'View attachment'}<ExternalLink className="ml-2 h-3.5 w-3.5"/></Button></td></tr>)}</tbody></table></div>}</div>
}
