import { FieldValue } from 'firebase-admin/firestore';
import {
  authorizationStatus,
  requireAuthContext,
  requireSuperAdmin,
} from '@/lib/server-authorization';

function normalized(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function errorResponse(error: unknown) {
  const status = authorizationStatus(error);
  if (status) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : 'Forbidden' },
      { status }
    );
  }
  console.error('User access sync API failed:', error);
  return Response.json({ ok: false, error: 'User access sync failed' }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const context = requireSuperAdmin(await requireAuthContext(request));
    const usersSnapshot = await context.db.collection('users').get();

    let synced = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const userDoc of usersSnapshot.docs) {
      const user = userDoc.data();
      const uid = String(user.uid ?? '').trim();
      if (!uid) {
        skipped += 1;
        continue;
      }

      try {
        await context.db.collection('userAccess').doc(uid).set(
          {
            uid,
            name: String(user.name ?? '').trim(),
            email: String(user.email ?? '').trim().toLowerCase(),
            userType: normalized(user.userType),
            accessLevel: normalized(user.accessLevel ?? user.role),
            accountRole: normalized(user.accountRole),
            status: normalized(user.status),
            companyId: user.companyId ? String(user.companyId).trim() : null,
            relieverId: user.relieverId ? String(user.relieverId).trim() : null,
            syncedFromUserDoc: userDoc.id,
            updatedAt: FieldValue.serverTimestamp(),
            syncAudit: {
              byUid: context.uid,
              byName: String(context.access.name ?? context.token.name ?? '').trim(),
              at: FieldValue.serverTimestamp(),
            },
          },
          { merge: true }
        );
        synced += 1;
      } catch (writeError) {
        console.error(`Failed server userAccess sync for ${uid}:`, writeError);
        errors.push(uid);
      }
    }

    return Response.json({
      ok: errors.length === 0,
      totalUsers: usersSnapshot.size,
      synced,
      skipped,
      errors,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
