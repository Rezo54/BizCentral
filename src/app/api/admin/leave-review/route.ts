import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return NextResponse.json({ success:false, message:'Unauthorised.' }, { status:401 });
    const decoded = await (await getAdminAuth()).verifyIdToken(token);
    const db = await getAdminDb();
    const accessSnap = await db.collection('userAccess').doc(decoded.uid).get();
    if (!accessSnap.exists) return NextResponse.json({ success:false, message:'BizCentral access not found.' }, { status:403 });
    const access = accessSnap.data() || {};
    if (String(access.status || '').toLowerCase() !== 'approved') return NextResponse.json({ success:false, message:'BizCentral access is not approved.' }, { status:403 });

    const requestId = request.nextUrl.searchParams.get('requestId') || '';
    if (!requestId) return NextResponse.json({ success:false, message:'Leave request is required.' }, { status:400 });
    const leaveSnap = await db.collection('leaveRequests').doc(requestId).get();
    if (!leaveSnap.exists) return NextResponse.json({ success:false, message:'Leave request not found.' }, { status:404 });
    const leave = leaveSnap.data() || {};
    if (String(access.userType || '').toLowerCase() === 'edo' && String(access.companyId || '') !== String(leave.edoId || '')) return NextResponse.json({ success:false, message:'You cannot review another EDO business.' }, { status:403 });

    const empSnap = await db.collection('employees').doc(String(leave.employeeId || '')).get();
    const emp = empSnap.exists ? (empSnap.data() || {}) : {};
    const payrollBalance = Number(emp.sageAnnualLeaveBalance ?? 0);
    const payrollPeriod = String(emp.sageLeaveBalancePeriod || '');

    const approvedSnap = await db.collection('leaveRequests').where('employeeId','==',String(leave.employeeId || '')).where('status','==','approved').get();
    let approvedAnnualSincePayroll = 0;
    for (const doc of approvedSnap.docs) {
      if (doc.id === requestId) continue;
      const r = doc.data();
      if (String(r.leaveType || '') !== 'annual_leave') continue;
      if (payrollPeriod && String(r.fromDate || '').slice(0,7) <= payrollPeriod) continue;
      approvedAnnualSincePayroll += Number(r.days || 0);
    }
    const currentBalance = Math.max(0, payrollBalance - approvedAnnualSincePayroll);
    const requestedDays = Number(leave.days || 0);
    const projectedBalance = String(leave.leaveType || '') === 'annual_leave' ? currentBalance - requestedDays : currentBalance;

    return NextResponse.json({success:true,review:{id:leaveSnap.id,employeeName:String(leave.employeeName||''),employeeCode:String(leave.employeeCode||''),edoName:String(leave.edoName||''),leaveType:String(leave.leaveType||''),fromDate:String(leave.fromDate||''),toDate:String(leave.toDate||''),days:requestedDays,reason:String(leave.reason||''),status:String(leave.status||'pending'),workWeek:String(leave.workWeek||''),documentName:String(leave.documentName||''),hasDocument:Boolean(leave.documentPath),payrollBalance,payrollPeriod,approvedAnnualSincePayroll,currentBalance,projectedBalance}});
  } catch (error) {
    console.error('Admin leave review failed:', error);
    return NextResponse.json({ success:false, message:'Unable to load leave review.' }, { status:500 });
  }
}
