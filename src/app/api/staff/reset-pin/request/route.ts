import { createHash, randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { cellphoneToLocal, normalizeCellphone } from '@/lib/employee-security';

const COOKIE = 'bizcentral_pin_reset_proof';
const PROOF_MINUTES = 10;
const COOLDOWN_SECONDS = 60;
const WINDOW_MINUTES = 15;
const MAX_PER_WINDOW = 3;
const BLOCK_MINUTES = 30;
const MAX_PER_DAY = 10;

const hashProof = (value: string) => createHash('sha256').update(value).digest('hex');
const genericFailure = () => NextResponse.json({ success: false, message: 'Unable to verify this Employee Portal account.' }, { status: 400 });

export async function POST(request: Request) {
  try {
    const db = await getAdminDb();
    const body = await request.json();
    const phone = normalizeCellphone(String(body.cellphone || ''));
    if (!/^27\d{9}$/.test(phone)) return genericFailure();

    const employeeQuery = await db.collection('employees').where('cellphone', '==', cellphoneToLocal(phone)).limit(2).get();
    if (employeeQuery.size !== 1 || employeeQuery.docs[0].data().status !== 'employed') return genericFailure();

    const employeeId = employeeQuery.docs[0].id;
    const ref = db.collection('employeePortalAccess').doc(employeeId);
    const now = Timestamp.now();
    const rawProof = randomBytes(32).toString('hex');
    const proofExpiresAt = Timestamp.fromMillis(now.toMillis() + PROOF_MINUTES * 60000);

    const result = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      const data = snap.exists ? snap.data() : undefined;
      if (!snap.exists || data?.portalActivated !== true || data?.cellphoneNormalized !== phone) return { allowed: false, status: 400, message: 'Unable to verify this Employee Portal account.' };

      const blockedUntil = data?.pinResetBlockedUntil;
      if (blockedUntil instanceof Timestamp && blockedUntil.toMillis() > now.toMillis()) return { allowed: false, status: 429, message: 'Too many reset requests. Please try again later.' };

      const last = data?.lastPinResetRequestedAt;
      if (last instanceof Timestamp && (now.toMillis() - last.toMillis()) / 1000 < COOLDOWN_SECONDS) return { allowed: false, status: 429, message: 'Please wait before requesting another verification code.' };

      let count = Number(data?.pinResetRequestCount || 0);
      let windowStart = data?.pinResetWindowStartedAt;
      if (!(windowStart instanceof Timestamp) || now.toMillis() - windowStart.toMillis() > WINDOW_MINUTES * 60000) { count = 0; windowStart = now; }
      if (count >= MAX_PER_WINDOW) {
        transaction.set(ref, { pinResetBlockedUntil: Timestamp.fromMillis(now.toMillis() + BLOCK_MINUTES * 60000), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        return { allowed: false, status: 429, message: 'Too many reset requests. Please try again later.' };
      }

      let daily = Number(data?.pinResetDailyCount || 0);
      let dailyStart = data?.pinResetDailyStartedAt;
      if (!(dailyStart instanceof Timestamp) || now.toMillis() - dailyStart.toMillis() > 86400000) { daily = 0; dailyStart = now; }
      if (daily >= MAX_PER_DAY) return { allowed: false, status: 429, message: 'The daily reset limit has been reached. Please try again later.' };

      transaction.set(ref, {
        pinResetProofHash: hashProof(rawProof),
        pinResetProofExpiresAt: proofExpiresAt,
        pinResetProofIssuedAt: now,
        pinResetRequestCount: count + 1,
        pinResetWindowStartedAt: windowStart,
        pinResetDailyCount: daily + 1,
        pinResetDailyStartedAt: dailyStart,
        lastPinResetRequestedAt: now,
        pinResetBlockedUntil: null,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return { allowed: true, status: 200, message: '' };
    });

    if (!result.allowed) return NextResponse.json({ success: false, message: result.message }, { status: result.status });

    const response = NextResponse.json({ success: true, cellphone: `+${phone}` }, { status: 200 });
    response.cookies.set(COOKIE, rawProof, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/staff/reset-pin', maxAge: PROOF_MINUTES * 60 });
    return response;
  } catch (error) {
    console.error('PIN reset request failed:', error);
    return NextResponse.json({ success: false, message: 'Unable to start PIN reset.' }, { status: 500 });
  }
}
