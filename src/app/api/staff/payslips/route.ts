import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, getAdminStorage } from '@/lib/firebase-admin';
import { STAFF_SESSION_COOKIE, validateStaffSession } from '@/lib/staff-session';

const MAX_PDF_BYTES = 10 * 1024 * 1024;

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
    const downloadId = request.nextUrl.searchParams.get('download');

    if (downloadId) {
      const snap = await db.collection('payslips').doc(downloadId).get();
      const data = snap.exists ? snap.data() : undefined;

      if (!data || data.employeeId !== session.employeeId) {
        return NextResponse.json(
          { success: false, message: 'Payslip not found.' },
          { status: 404, headers: { 'Cache-Control': 'no-store' } }
        );
      }

      const storagePath =
        typeof data.pdfStoragePath === 'string' ? data.pdfStoragePath.trim() : '';

      if (!storagePath || !storagePath.startsWith('payslips/') || !storagePath.endsWith('.pdf')) {
        return NextResponse.json(
          { success: false, message: 'Payslip is unavailable.' },
          { status: 404, headers: { 'Cache-Control': 'no-store' } }
        );
      }

      const storage = await getAdminStorage();
      const file = storage.bucket().file(storagePath);
      const [metadata] = await file.getMetadata();
      const size = Number(metadata.size || 0);

      if (
        metadata.contentType !== 'application/pdf' ||
        !Number.isFinite(size) ||
        size <= 0 ||
        size > MAX_PDF_BYTES
      ) {
        return NextResponse.json(
          { success: false, message: 'Payslip is unavailable.' },
          { status: 404, headers: { 'Cache-Control': 'no-store' } }
        );
      }

      const [buffer] = await file.download();
      const period =
        typeof data.payPeriod === 'string'
          ? data.payPeriod.replace(/[^0-9A-Za-z_-]/g, '_')
          : 'payslip';

      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Length': String(buffer.length),
          'Content-Disposition': `attachment; filename="payslip-${period}.pdf"`,
          'Cache-Control': 'private, no-store, max-age=0',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

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
            typeof data.pdfStoragePath === 'string' &&
            data.pdfStoragePath.startsWith('payslips/') &&
            data.pdfStoragePath.endsWith('.pdf'),
        };
      })
      .filter((p) => p.payPeriod && p.downloadAvailable)
      .sort((a, b) => b.payPeriod.localeCompare(a.payPeriod));

    return NextResponse.json(
      { success: true, payslips },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Staff payslip request failed:', error);
    return NextResponse.json(
      { success: false, message: 'Unable to process payslip request.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
