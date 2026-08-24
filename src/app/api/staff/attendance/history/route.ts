import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { STAFF_SESSION_COOKIE, validateStaffSession } from '@/lib/staff-session';

type WorkWeek = '5_day' | '6_day';
type DayStatus = 'present' | 'absent' | 'leave' | 'off';

function saToday() {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}
function dayOfWeek(date:string){return new Date(`${date}T12:00:00+02:00`).getUTCDay()}
function scheduled(workWeek:WorkWeek,date:string){const d=dayOfWeek(date);if(d===0)return false;if(d===6)return workWeek==='6_day';return d>=1&&d<=5}
function monthDates(month:string){const [y,m]=month.split('-').map(Number);if(!y||!m)return[];const last=new Date(Date.UTC(y,m,0)).getUTCDate();return Array.from({length:last},(_,i)=>`${y}-${String(m).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`)}
function leaveLabel(v:string){const k=v.trim().toLowerCase();const labels:Record<string,string>={annual:'Annual Leave',annual_leave:'Annual Leave',sick:'Sick Leave',sick_leave:'Sick Leave',unpaid:'Unpaid Leave',unpaid_leave:'Unpaid Leave',family_responsibility:'Family Responsibility',family_responsibility_leave:'Family Responsibility',maternity:'Maternity Leave',parental:'Parental Leave'};return labels[k]||v||'Approved Leave'}

export async function GET(request:NextRequest){
 try{
  const token=request.cookies.get(STAFF_SESSION_COOKIE)?.value??'';const session=await validateStaffSession(token);if(!session)return NextResponse.json({success:false,message:'Unauthorised.'},{status:401});
  const today=saToday();const requested=(request.nextUrl.searchParams.get('month')||today.slice(0,7)).trim();if(!/^\d{4}-\d{2}$/.test(requested))return NextResponse.json({success:false,message:'Invalid month.'},{status:400});
  const dates=monthDates(requested);if(!dates.length)return NextResponse.json({success:false,message:'Invalid month.'},{status:400});
  const monthStart=dates[0],monthEnd=dates[dates.length-1],effectiveEnd=requested===today.slice(0,7)?today:monthEnd;
  const db=await getAdminDb();const empSnap=await db.collection('employees').doc(session.employeeId).get();if(!empSnap.exists)return NextResponse.json({success:false,message:'Employee not found.'},{status:404});
  const emp=empSnap.data()||{};const workWeek:WorkWeek=String(emp.workWeek||'').toLowerCase()==='6_day'?'6_day':'5_day';const appointment=String(emp.appointmentDate||'');const termination=String(emp.terminationDate||'');
  const [exceptionsSnap,leaveSnap,recordsSnap]=await Promise.all([
   db.collection('attendanceExceptions').where('employeeId','==',session.employeeId).get(),
   db.collection('leaveRequests').where('employeeId','==',session.employeeId).where('status','==','approved').get(),
   db.collection('attendanceRecords').where('employeeId','==',session.employeeId).get(),
  ]);
  const exceptions=new Map<string,{reason:string;notes:string}>();exceptionsSnap.docs.forEach(d=>{const x=d.data();const date=String(x.date||d.id.split('_').pop()||'');if(date>=monthStart&&date<=monthEnd)exceptions.set(date,{reason:String(x.reason||''),notes:String(x.notes||'')})});
  const leaves=leaveSnap.docs.map(d=>{const x=d.data();return{from:String(x.fromDate||''),to:String(x.toDate||''),type:String(x.leaveType||x.type||''),notes:String(x.notes||x.reason||'')}}).filter(x=>x.from&&x.to&&x.from<=monthEnd&&x.to>=monthStart);
  const work=new Map<string,{type:string;notes:string}>();recordsSnap.docs.forEach(d=>{const x=d.data();const date=String(x.date||'');const type=String(x.recordType||'');if(date>=monthStart&&date<=monthEnd&&(type==='saturday_work'||type==='sunday_work'))work.set(date,{type,notes:String(x.notes||'')})});
  const days=dates.filter(date=>date<=effectiveEnd).map(date=>{
   const active=(!appointment||date>=appointment)&&(!termination||date<=termination);if(!active)return{date,status:'off' as DayStatus,scheduled:false,reason:'Not employed',notes:'',exception:false};
   const isScheduled=scheduled(workWeek,date);let status:DayStatus=isScheduled?'present':'off',reason='',notes='',exception=false;
   const special=work.get(date);if(special){status='present';reason=special.type==='saturday_work'?'Saturday work':'Sunday work';notes=special.notes;exception=true}
   if(isScheduled){const leave=leaves.find(x=>x.from<=date&&x.to>=date);if(leave){status='leave';reason=leaveLabel(leave.type);notes=leave.notes;exception=true}else{const absence=exceptions.get(date);if(absence){status='absent';reason=absence.reason||'Absent';notes=absence.notes;exception=true}}}
   return{date,status,scheduled:isScheduled,reason,notes,exception};
  });
  const summary={scheduled:days.filter(d=>d.scheduled).length,present:days.filter(d=>d.status==='present').length,absent:days.filter(d=>d.status==='absent').length,leave:days.filter(d=>d.status==='leave').length,off:days.filter(d=>d.status==='off').length};
  return NextResponse.json({success:true,month:requested,workWeek,summary,days,exceptions:days.filter(d=>d.exception||d.status==='absent'||d.status==='leave')});
 }catch(error){console.error('Staff attendance history failed:',error);return NextResponse.json({success:false,message:'Unable to load attendance history.'},{status:500})}
}
