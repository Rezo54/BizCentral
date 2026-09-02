import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';

const ALLOWED_TYPES = new Set(['taskraft', 'edo', 'reliever']);

function normalized(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function bearerToken(request: Request): string {
  const header = request.headers.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

export async function POST(request: Request) {
  try {
    // Signup is intentionally available to a newly authenticated Firebase identity
    // that does not yet have approved userAccess. We verify identity here, but do
    // NOT use requireAuthContext(), because that correctly rejects pending users.
    const idToken = bearerToken(request);
    if (!idToken) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    let token;
    try {
      token = await (await getAdminAuth()).verifyIdToken(idToken);
    } catch {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const name = clean(body?.name);
    const email = normalized(body?.email);
    const requestedUserType = normalized(body?.userType);
    const signupCompanyId = clean(body?.signupCompanyId);

    if (!name || !email || !ALLOWED_TYPES.has(requestedUserType)) {
      return Response.json({ ok: false, error: 'Invalid signup request' }, { status: 400 });
    }

    if (normalized(token.email) !== email) {
      return Response.json({ ok: false, error: 'Authenticated email does not match signup email' }, { status: 403 });
    }

    if (requestedUserType !== 'taskraft' && !signupCompanyId) {
      return Response.json({ ok: false, error: 'A valid signup company is required' }, { status: 400 });
    }

    const db = await getAdminDb();
    let companyId: string | null = null;
    let relieverId: string | null = null;
    let businessName: string | null = null;

    if (requestedUserType !== 'taskraft') {
      const directoryRef = db.collection('signupCompanies').doc(signupCompanyId);
      const directorySnap = await directoryRef.get();
      if (!directorySnap.exists) {
        return Response.json({ ok: false, error: 'Signup company not found' }, { status: 400 });
      }

      const directory = directorySnap.data() ?? {};
      const directoryType = normalized(directory.type);
      const sourceId = clean(directory.sourceId);
      if (directory.active !== true || directoryType !== requestedUserType || !sourceId) {
        return Response.json({ ok: false, error: 'Signup company is not valid for this registration type' }, { status: 400 });
      }

      businessName = clean(directory.name) || null;
      if (requestedUserType === 'edo') companyId = sourceId;
      if (requestedUserType === 'reliever') relieverId = sourceId;
    }

    // Prevent duplicate pending/profile creation for the same Firebase identity.
    const existingProfile = await db.collection('users').where('uid', '==', token.uid).limit(1).get();
    if (!existingProfile.empty) {
      return Response.json({ ok: false, error: 'A BizCentral signup request already exists for this account' }, { status: 409 });
    }

    const userRef = db.collection('users').doc();
    const accessRef = db.collection('userAccess').doc(token.uid);
    const batch = db.batch();

    // /users is workflow/profile data. Requested type/company are retained so the
    // superadmin can make an informed approval decision, but no effective access
    // level is assigned by signup.
    batch.set(userRef, {
      uid: token.uid,
      name,
      email,
      userType: requestedUserType,
      requestedUserType,
      role: 'pending',
      status: 'pending',
      companyId,
      relieverId,
      businessName,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Canonical record is deliberately inert until the superadmin approval API
    // derives and writes effective userType/accessLevel.
    batch.set(accessRef, {
      uid: token.uid,
      name,
      email,
      status: 'pending',
      accessLevel: 'pending',
      requestedUserType,
      requestedCompanyId: companyId,
      requestedRelieverId: relieverId,
      syncedFromUserDoc: userRef.id,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    return Response.json({
      ok: true,
      status: 'pending',
      message: 'Account created successfully. Await admin approval.',
    });
  } catch (error) {
    console.error('Signup API failed:', error);
    return Response.json({ ok: false, error: 'Unable to create BizCentral signup request' }, { status: 500 });
  }
}
