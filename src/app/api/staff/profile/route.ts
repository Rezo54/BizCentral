import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { STAFF_SESSION_COOKIE, validateStaffSession } from '@/lib/staff-session';

function maskIdNumber(value: unknown) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 4) return '';
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(STAFF_SESSION_COOKIE)?.value ?? '';
    const session = token ? await validateStaffSession(token) : null;
    if (!session) return NextResponse.json({success:false,authenticated:false},{status:401});
    const snap = await (await getAdminDb()).collection('employees').doc(session.employeeId).get();
    if (!snap.exists) return NextResponse.json({success:false,message:'Employee record not found.'},{status:404});
    const e=snap.data()||{};
    return NextResponse.json({success:true,profile:{
      id:snap.id, employeeCode:String(e.employeeCode||''), firstName:String(e.firstName||e.name||''), surname:String(e.surname||''),
      occupation:String(e.occupation||''), businessName:String(e.businessName||e.edoName||''), edoId:String(e.edoId||session.edoId||''),
      idNumber:maskIdNumber(e.idNumber), cellphone:String(e.cellphone||e.cellphoneNumber||''), appointmentDate:String(e.appointmentDate||''),
      workWeek:String(e.workWeek||''), status:String(e.status||''), profilePhotoUrl:String(e.profilePhotoUrl||'')
    }});
  } catch(error){console.error('Staff profile load failed:',error);return NextResponse.json({success:false,message:'Unable to load your profile.'},{status:500})}
}
