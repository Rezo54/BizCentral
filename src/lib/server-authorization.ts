import 'server-only';

import type { DecodedIdToken } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';

export type BizUserType = 'taskraft' | 'edo' | 'reliever' | string;
export type BizAccessLevel = 'standard' | 'power_user' | 'admin' | 'superadmin' | 'super_admin' | string;

export type BizAccessRecord = {
  uid?: string;
  status?: string;
  userType?: BizUserType;
  accessLevel?: BizAccessLevel;
  role?: string;
  accountRole?: string;
  companyId?: string;
  edoId?: string;
  relieverId?: string;
  name?: string;
  [key: string]: unknown;
};

export type AuthContext = {
  db: Firestore;
  uid: string;
  token: DecodedIdToken;
  access: BizAccessRecord;
  userType: string;
  accessLevel: string;
  accountRole: string;
  companyId: string;
};

export class AuthorizationError extends Error {
  readonly status: 401 | 403;

  constructor(message: string, status: 401 | 403) {
    super(message);
    this.name = 'AuthorizationError';
    this.status = status;
  }
}

function normalized(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function bearerToken(request: Request): string {
  const header = request.headers.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

export async function requireAuthContext(request: Request): Promise<AuthContext> {
  const idToken = bearerToken(request);
  if (!idToken) throw new AuthorizationError('Unauthorized', 401);

  let token: DecodedIdToken;
  try {
    token = await (await getAdminAuth()).verifyIdToken(idToken);
  } catch {
    throw new AuthorizationError('Unauthorized', 401);
  }

  const db = await getAdminDb();
  const snap = await db.collection('userAccess').doc(token.uid).get();
  if (!snap.exists) throw new AuthorizationError('User access not found', 403);

  const access = (snap.data() ?? {}) as BizAccessRecord;
  const accessStatus = normalized(access.status);
  if (accessStatus !== 'approved') {
    const message =
      accessStatus === 'pending' ? 'User access is pending' :
      accessStatus === 'rejected' ? 'User access is rejected' :
      accessStatus === 'removed' ? 'User access is removed' :
      'User access is not approved';
    throw new AuthorizationError(message, 403);
  }

  return {
    db,
    uid: token.uid,
    token,
    access,
    userType: normalized(access.userType),
    accessLevel: normalized(access.accessLevel ?? access.role),
    accountRole: normalized(access.accountRole),
    // companyId is the canonical organisation/scope identifier for the current
    // user. Older reliever records used relieverId, so include it as a migration
    // fallback while consumers move to the canonical companyId property.
    companyId: String(access.companyId ?? access.edoId ?? access.relieverId ?? '').trim(),
  };
}

export function requireTaskraft(context: AuthContext): AuthContext {
  if (context.userType !== 'taskraft') throw new AuthorizationError('Taskraft access required', 403);
  return context;
}

export function requireAdmin(context: AuthContext): AuthContext {
  requireTaskraft(context);
  if (!['admin', 'superadmin', 'super_admin'].includes(context.accessLevel)) throw new AuthorizationError('Taskraft admin access required', 403);
  return context;
}

export function requireSuperAdmin(context: AuthContext): AuthContext {
  requireTaskraft(context);
  if (!['superadmin', 'super_admin'].includes(context.accessLevel)) throw new AuthorizationError('Superadmin access required', 403);
  return context;
}

export function requireTaskraftAccountant(context: AuthContext): AuthContext {
  requireTaskraft(context);
  if (context.accountRole !== 'accountant' && !['superadmin', 'super_admin'].includes(context.accessLevel)) throw new AuthorizationError('Taskraft accountant access required', 403);
  return context;
}

export function requireEdo(context: AuthContext): AuthContext {
  if (context.userType !== 'edo' || !context.companyId) throw new AuthorizationError('EDO access required', 403);
  return context;
}

export function requireCompanyScope(context: AuthContext, companyId: string): AuthContext {
  requireEdo(context);
  if (!companyId || context.companyId !== companyId) throw new AuthorizationError('Company access denied', 403);
  return context;
}

export function authorizationStatus(error: unknown): 401 | 403 | null {
  return error instanceof AuthorizationError ? error.status : null;
}
