import { FieldValue } from 'firebase-admin/firestore';
import {
  AuthorizationError,
  authorizationStatus,
  requireAuthContext,
  requireSuperAdmin,
} from '@/lib/server-authorization';

type Decision = 'approve' | 'reject' | 'remove';
const APPROVABLE_ROLES = new Set(['client_employee', 'client', 'admin_user', 'supervisor', 'supplier']);

function normalized(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function mapUserType(role: string): string {
  if (role === 'client_employee' || role === 'supplier') return 'reliever';
  if (role === 'client') return 'edo';
  if (role === 'admin_user' || role === 'supervisor') return 'taskraft';
  return 'unknown';
}

function mapAccessLevel(role: string): string {
  if (role === 'client') return 'power_user';
  if (role === 'admin_user') return 'admin';
  return 'standard';
}

function errorResponse(error: unknown) {
  const status = authorizationStatus(error);
  if (status) return Response.json({ ok: false, error: error instanceof Error ? error.message : 'Forbidden' }, { status });
  console.error('User administration API failed:', error);
  return Response.json({ ok: false, error: 'User administration failed' }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const context = requireSuperAdmin(await requireAuthContext(request));
    const snap = await context.db.collection('users').get();
    const users = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return Response.json({ ok: true, users });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const context = requireSuperAdmin(await requireAuthContext(request));
    const body = await request.json().catch(() => ({}));
    const decision = normalized(body?.decision) as Decision;
    const userId = String(body?.userId ?? '').trim();

    if (!userId || !['approve', 'reject', 'remove'].includes(decision)) {
      return Response.json({ ok: false, error: 'Invalid user decision request' }, { status: 400 });
    }

    const userRef = context.db.collection('users').doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return Response.json({ ok: false, error: 'User not found' }, { status: 404 });

    const user = userSnap.data() ?? {};
    const targetUid = String(user.uid ?? '').trim();
    if (!targetUid) return Response.json({ ok: false, error: 'User has no Firebase Authentication UID' }, { status: 409 });

    if (decision === 'remove' && targetUid === context.uid) {
      throw new AuthorizationError('You cannot remove your own superadmin access', 403);
    }

    const accessRef = context.db.collection('userAccess').doc(targetUid);
    const targetAccessSnap = await accessRef.get();
    const targetAccess = targetAccessSnap.data() ?? {};
    const targetAccessLevel = normalized(targetAccess.accessLevel ?? targetAccess.role ?? user.accessLevel ?? user.role);
    if (decision === 'remove' && ['superadmin', 'super_admin'].includes(targetAccessLevel)) {
      throw new AuthorizationError('A superadmin account cannot be removed through this action', 403);
    }

    const batch = context.db.batch();
    const actor = {
      uid: context.uid,
      name: String(context.access.name ?? context.token.name ?? '').trim(),
      email: String(context.token.email ?? '').trim().toLowerCase(),
    };

    if (decision === 'approve') {
      // The UI may propose one of the finite business roles, but it never supplies
      // effective userType/accessLevel. Those are derived here on the server.
      const role = normalized(body?.role ?? user.role);
      if (!APPROVABLE_ROLES.has(role)) {
        return Response.json({ ok: false, error: 'Assign a valid role before approval' }, { status: 400 });
      }

      const userType = mapUserType(role);
      const accessLevel = mapAccessLevel(role);
      if (userType === 'edo' && !String(user.companyId ?? '').trim()) {
        return Response.json({ ok: false, error: 'EDO user requires a companyId before approval' }, { status: 400 });
      }

      batch.update(userRef, { status: 'approved', role, userType, accessLevel });
      batch.set(accessRef, {
        uid: targetUid,
        name: String(user.name ?? '').trim(),
        email: String(user.email ?? '').trim().toLowerCase(),
        userType,
        accessLevel,
        status: 'approved',
        companyId: userType === 'edo' ? String(user.companyId ?? '').trim() : null,
        relieverId: userType === 'reliever' ? String(user.relieverId ?? '').trim() || null : null,
        syncedFromUserDoc: userId,
        updatedAt: FieldValue.serverTimestamp(),
        accessDecision: { action: 'approved', by: actor, at: FieldValue.serverTimestamp() },
      }, { merge: true });
    }

    if (decision === 'reject') {
      batch.update(userRef, { status: 'rejected' });
      batch.set(accessRef, {
        uid: targetUid,
        name: String(user.name ?? '').trim(),
        email: String(user.email ?? '').trim().toLowerCase(),
        userType: normalized(user.userType) || mapUserType(normalized(user.role)),
        accessLevel: 'pending',
        status: 'rejected',
        companyId: user.companyId ? String(user.companyId).trim() : null,
        syncedFromUserDoc: userId,
        updatedAt: FieldValue.serverTimestamp(),
        accessDecision: { action: 'rejected', by: actor, at: FieldValue.serverTimestamp() },
      }, { merge: true });
    }

    if (decision === 'remove') {
      batch.set(accessRef, {
        uid: targetUid,
        name: String(user.name ?? '').trim(),
        email: String(user.email ?? '').trim().toLowerCase(),
        status: 'removed',
        updatedAt: FieldValue.serverTimestamp(),
        accessDecision: { action: 'removed', by: actor, at: FieldValue.serverTimestamp() },
      }, { merge: true });
      batch.delete(userRef);
    }

    await batch.commit();
    return Response.json({ ok: true, decision, userId, uid: targetUid });
  } catch (error) {
    return errorResponse(error);
  }
}
