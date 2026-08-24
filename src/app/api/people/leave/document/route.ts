import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, getAdminStorage } from '@/lib/firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) return NextResponse.json({ success:false, message:'Unauthorised.' }, { status:401 });
    const adminApp = await getAdminApp();
    const decoded = await getAuth(adminApp).verifyIdToken(idToken);
    const db = await getAdminDb();
    const accessSnap = await db.collection('userAccess').doc(decoded.uid).get();
    if (!accessSnap.exists) return NextResponse.json({ success:false, message:'Access record not found.' }, { status:403 });
    const access = accessSnap.data() || {};
    if (String(access.status||'').toLowerCase() !== 'approved') return NextResponse.json({ success:false, message:'Access not approved.' }, { status:403 });

    const requestId = request.nextUrl.searchParams.get('requestId') || '';
    if (!requestId) return NextResponse.json({ success:false, message:'Leave request is required.' }, { status:400 });
    const leaveSnap = await db.collection('leaveRequests').doc(requestId).get();
    if (!leaveSnap.exists) return NextResponse.json({ success:false, message:'Leave request not found.' }, { status:404 });
    const leave = leaveSnap.data() || {};
    const userType = String(access.userType||'').toLowerCase();
    if (userType === 'edo' && String(access.companyId||'') !== String(leave.edoId||'')) return NextResponse.json({ success:false, message:'You cannot view documents for another EDO business.' }, { status:403 });
    const documentPath = String(leave.documentPath||'');
    if (!documentPath) return NextResponse.json({ success:false, message:'No supporting document is attached.' }, { status:404 });

    const storage = await getAdminStorage();
    const [url] = await storage.bucket().file(documentPath).getSignedUrl({ action:'read', expires:Date.now()+10*60*1000 });
    return NextResponse.json({ success:true, url, documentName:String(leave.documentName||'Supporting document') });
  } catch (error) {
    console.error('Leave document review failed:', error);
    return NextResponse.json({ success:false, message:'Unable to open supporting document.' }, { status:500 });
  }
}
