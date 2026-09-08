import { createHash, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import bcrypt from 'bcryptjs';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';

const COOKIE = 'bizcentral_pin_reset_proof';
const hashProof = (value: string) => createHash('sha256').update(value).digest('hex');

function safeEqualHex(a: string, b: string) {
  try {
    const x = Buffer.from(a, 'hex');
    const y = Buffer.from(b, 'hex');
    return x.length === y.length && timingSafeEqual(x, y);
  } catch { return false; }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const idToken = typeof body?.idToken === 'string' ? body.idToken.trim() : '';
    const pin = typeof body?.pin === 'string' ? body.pin.trim() : '';
    const rawProof = request.cookies.get(COOKIE)?.value || '';
    if (!idToken || !rawProof) return NextResponse.json({ success: false, message: 'Your PIN reset verification has expired.' }, { status: 401 });
    if (!/^\d{6}$/.test(pin)) return NextResponse.json({ success: false, message: 'PIN must be exactly 6 digits.' }, { status: 400 });

    const auth = await getAdminAuth();
    const db = await getAdminDb();
    let decoded;
    try { decoded = await auth.verifyIdToken(idToken); }
    catch { return NextResponse.json({ success: false, message: 'Your OTP verification is invalid or expired.' }, { status: 401 }); }

    const phone = String(decoded.phone_number || '').replace(/\D/g, '');
    if (!/^27\d{9}$/.test(phone)) return NextResponse.json({ success: false, message: 'Unable to verify this Employee Portal account.' }, { status: 401 });

    const query = await db.collection('employeePortalAccess').where('cellphoneNormalized', '==', phone).limit(2).get();
    if (query.size !== 1) return NextResponse.json({ success: false, message: 'Unable to verify this Employee Portal account.' }, { status: 400 });

    const ref = query.docs[0].ref;
    const employeeId = query.docs[0].id;
    const pinHash = await bcrypt.hash(pin, 12);
    const now = Timestamp.now();

    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      const data = snap.data();
      const stored = typeof data?.pinResetProofHash === 'string' ? data.pinResetProofHash : '';
      const expires = data?.pinResetProofExpiresAt;
      if (data?.portalActivated !== true || !stored || !(expires instanceof Timestamp) || expires.toMillis() <= now.toMillis() || !safeEqualHex(stored, hashProof(rawProof))) {
        throw new Error('INVALID_RESET_PROOF');
      }
      transaction.update(ref, {
        pinHash,
        pinResetProofHash: FieldValue.delete(),
        pinResetProofExpiresAt: FieldValue.delete(),
        pinResetProofIssuedAt: FieldValue.delete(),
        loginFailureCount: 0,
        loginBlockedUntil: FieldValue.delete(),
        pinChangedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    const sessions = await db.collection('employeePortalSessions').where('employeeId', '==', employeeId).get();
    if (!sessions.empty) {
      const batch = db.batch();
      sessions.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }

    const response = NextResponse.json({ success: true, message: 'PIN reset successfully. Please login with your new PIN.' });
    response.cookies.set(COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/staff/reset-pin', maxAge: 0 });
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_RESET_PROOF') return NextResponse.json({ success: false, message: 'Your PIN reset verification is invalid or expired.' }, { status: 401 });
    console.error('PIN reset completion failed:', error);
    return NextResponse.json({ success: false, message: 'Unable to reset PIN.' }, { status: 500 });
  }
}
