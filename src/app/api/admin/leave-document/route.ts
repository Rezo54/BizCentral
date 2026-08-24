import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb, getAdminStorage } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return NextResponse.json({ success:false, message:'Unauthorised.' }, { status:401 });

    const adminAuth = await getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(token);
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

    const userType = String(access.userType || '').toLowerCase();
    if (userType === 'edo' && String(access.companyId || '') !== String(leave.edoId || '')) {
      return NextResponse.json({ success:false, message:'You cannot view documents for another EDO business.' }, { status:403 });
    }

    const documentPath = String(leave.documentPath || '');
    if (!documentPath) return NextResponse.json({ success:false, message:'No supporting document is attached to this request.' }, { status:404 });

    const expectedPrefix = `leave-documents/${String(leave.edoId || '')}/${String(leave.employeeId || '')}/`;
    if (!documentPath.startsWith(expectedPrefix)) return NextResponse.json({ success:false, message:'Invalid supporting document path.' }, { status:403 });

    const storage = await getAdminStorage();
    const file = storage.bucket().file(documentPath);
    const [exists] = await file.exists();
    if (!exists) return NextResponse.json({ success:false, message:'Supporting document was not found in storage.' }, { status:404 });

    const [url] = await file.getSignedUrl({ action:'read', expires:Date.now() + 10 * 60 * 1000 });
    return NextResponse.json({ success:true, url, documentName:String(leave.documentName || 'Supporting document') });
  } catch (error) {
    console.error('Admin leave document view failed:', error);
    return NextResponse.json({ success:false, message:'Unable to open supporting document.' }, { status:500 });
  }
}
