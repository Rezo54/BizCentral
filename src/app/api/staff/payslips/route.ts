import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { STAFF_SESSION_COOKIE, validateStaffSession } from '@/lib/staff-session';

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(STAFF_SESSION_COOKIE)?.value ?? '';
    const session = await validateStaffSession(token);

    if (!session) {
      return NextResponse.json(
        { success: false, message: 'Unauthorised.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const db = await getAdminDb();
    const snapshot = await db
      .collection('payslips')
      .where('employeeId', '==', session.employeeId)
      .get();

    const payslips = snapshot.docs
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          payPeriod: typeof data.payPeriod === 'string' ? data.payPeriod : '',
          payDate: typeof data.payDate === 'string' ? data.payDate : '',
          netPay: typeof data.netPay === 'number' ? data.netPay : null,
          downloadAvailable:
            typeof data.pdfUrl === 'string' && data.pdfUrl.trim().length > 0,
        };
      })
      .filter((p) => p.payPeriod && p.downloadAvailable)
      .sort((a, b) => b.payPeriod.localeCompare(a.payPeriod));

    return NextResponse.json(
      { success: true, payslips },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Staff payslip list failed:', error);
    return NextResponse.json(
      { success: false, message: 'Unable to load payslips.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
