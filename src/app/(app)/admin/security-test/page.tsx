'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

type TestResult = { label:string; expected:string; httpStatus:number|null; body:any; error:string|null; passed:boolean };

export default function SecuritySessionTestPage() {
  const [authReady,setAuthReady]=useState(false); const [signedInEmail,setSignedInEmail]=useState<string|null>(null); const [loading,setLoading]=useState(false); const [results,setResults]=useState<TestResult[]>([]);
  useEffect(()=>onAuthStateChanged(auth,u=>{setSignedInEmail(u?.email??null);setAuthReady(true)}),[]);

  async function requestJson(label:string,expected:string,url:string,method:'GET'|'POST'|'PATCH',authorization?:string,expectStatus=200,body?:unknown){
    try { const headers:Record<string,string>={}; if(authorization!==undefined)headers.Authorization=authorization;if(body!==undefined)headers['Content-Type']='application/json'; const response=await fetch(url,{method,cache:'no-store',headers,body:body===undefined?undefined:JSON.stringify(body)});let responseBody:any=null;try{responseBody=await response.json()}catch{responseBody={error:'Response was not valid JSON.'}}return{label,expected,httpStatus:response.status,body:responseBody,error:null,passed:response.status===expectStatus} as TestResult;} catch(error){return{label,expected,httpStatus:null,body:null,error:error instanceof Error?error.message:'Request failed.',passed:false} as TestResult;}
  }

  async function runApprovedAccountTest(){setLoading(true);try{const user=auth.currentUser;if(!user){setResults([{label:'Approved account',expected:'200 approved canonical session',httpStatus:null,body:null,error:'No Firebase user is currently signed in.',passed:false}]);return}const token=await user.getIdToken(true);const r=await requestJson('Approved current account','HTTP 200 with approved canonical user','/api/session','GET',`Bearer ${token}`,200);r.passed=r.passed&&r.body?.ok===true&&r.body?.user?.status==='approved';setResults([r])}finally{setLoading(false)}}
  async function runSafeNegativeTests(){setLoading(true);try{const a=await requestJson('Missing token','HTTP 401 Unauthorized','/api/session','GET',undefined,401);const b=await requestJson('Malformed token','HTTP 401 Unauthorized','/api/session','GET','Bearer this-is-not-a-valid-firebase-token',401);const c=await requestJson('Wrong authorization scheme','HTTP 401 Unauthorized','/api/session','GET','Basic deliberately-invalid',401);setResults([a,b,c])}finally{setLoading(false)}}
  async function runUserAdminBoundaryTests(){setLoading(true);try{const tests:TestResult[]=[];tests.push(await requestJson('User Admin — missing token','HTTP 401','/api/admin/users','GET',undefined,401));const current=auth.currentUser;if(current){const token=await current.getIdToken(true);const r=await requestJson('User Admin — current account','Superadmin 200; other approved accounts 403','/api/admin/users','GET',`Bearer ${token}`,200);r.passed=r.httpStatus===200||r.httpStatus===403;tests.push(r)}setResults(tests)}finally{setLoading(false)}}

  async function runEmployeeMasterBoundaryTests(){
    setLoading(true);
    try {
      const user=auth.currentUser;
      if(!user){setResults([{label:'Employee Master',expected:'Signed-in EDO required',httpStatus:null,body:null,error:'No Firebase user is currently signed in.',passed:false}]);return}
      const token=await user.getIdToken(true); const bearer=`Bearer ${token}`;
      const tests:TestResult[]=[];
      const create=await requestJson('Employee Create — current EDO','HTTP 403 Forbidden; no employee created','/api/admin/employees','POST',bearer,403,{edoId:'edo-2-boys-2-girls-pty-ltd',employeeCode:'SEC-ATTACK-001',firstName:'Unauthorized',surname:'Security Test',occupation:'Market Developer',workWeek:'5_day',appointmentDate:'2026-09-02',status:'employed'});tests.push(create);
      const edit=await requestJson('Employee Edit — current EDO','HTTP 403 Forbidden; existing employee unchanged','/api/admin/employees/edo-2-boys-2-girls-pty-ltd-sec001','PATCH',bearer,403,{firstName:'UNAUTHORIZED EDIT',surname:'Security Test',occupation:'Market Developer',workWeek:'5_day',appointmentDate:'2026-09-02',status:'employed'});tests.push(edit);
      const bulk=await requestJson('Employee Bulk — current EDO','HTTP 403 Forbidden; no bulk employee created','/api/admin/employees/bulk','POST',bearer,403,{rows:[{rowNumber:2,edoId:'edo-2-boys-2-girls-pty-ltd',employeeCode:'SEC-ATTACK-BULK-001',firstName:'Unauthorized',surname:'Bulk Test',occupation:'Market Developer',workWeek:'5_day',appointmentDate:'2026-09-02',status:'employed'}]});tests.push(bulk);
      setResults(tests);
    } finally { setLoading(false); }
  }

  return <main className="mx-auto max-w-4xl space-y-6 p-6">
    <div><h1 className="text-2xl font-semibold">BizCentral Security Test</h1><p className="mt-2 text-sm text-muted-foreground">Temporary Employee Mod diagnostic for canonical API authorization.</p></div>
    <section className="rounded-lg border p-4"><div className="text-sm font-medium">Browser authentication</div><div className="mt-2 text-sm">{!authReady?'Checking Firebase session…':signedInEmail?`Signed in as ${signedInEmail}`:'Not signed in'}</div></section>
    <div className="flex flex-wrap gap-3">
      <button type="button" onClick={runApprovedAccountTest} disabled={!authReady||!signedInEmail||loading} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Test Current Approved Account</button>
      <button type="button" onClick={runSafeNegativeTests} disabled={loading} className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50">Run Session Negative Tests</button>
      <button type="button" onClick={runUserAdminBoundaryTests} disabled={loading} className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50">Test User Admin Boundary</button>
      <button type="button" onClick={runEmployeeMasterBoundaryTests} disabled={!authReady||!signedInEmail||loading} className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50">Test Employee Master Boundary</button>
    </div>
    {results.length>0&&<section className="space-y-4">{results.map(r=><div key={r.label} className="rounded-lg border p-4"><div className="flex items-center justify-between gap-4"><h2 className="font-semibold">{r.label}</h2><span className="text-sm font-semibold">{r.passed?'PASS':'CHECK'}</span></div><div className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2"><div><div className="font-medium">Expected</div><div>{r.expected}</div></div><div><div className="font-medium">HTTP Status</div><div>{r.httpStatus??'—'}</div></div><div className="sm:col-span-2"><div className="font-medium">Server response</div><div>{r.error??r.body?.error??(r.body?.ok?'Authorized response returned':'—')}</div></div></div><details className="mt-3"><summary className="cursor-pointer text-sm font-medium">Raw sanitized response</summary><pre className="mt-3 overflow-auto rounded-md border p-3 text-xs">{JSON.stringify(r.body,null,2)}</pre></details></div>)}</section>}
    <section className="rounded-lg border p-4 text-sm"><div className="font-medium">Safety boundary</div><p className="mt-2">Employee Master tests deliberately attempt protected create, edit and bulk mutations. They pass only when the current non-admin account receives HTTP 403 before any Firestore mutation occurs.</p></section>
  </main>;
}
