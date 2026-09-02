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

/**
 * Canonical server-side BizCentral authorization context.
 *
 * IMPORTANT: this helper is additive in Security Migration Step 1.
 * Existing API/UI paths are not changed merely by introducing it.
 * Effective authorization comes from userAccess/{uid}; client-supplied
 * userType/accessLevel/companyId values are never accepted as authority.
 */
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
  if (normalized(access.status) !== 'approved') {
    throw new AuthorizationError('User access is not approved', 403);
  }

  return {
    db,
    uid: token.uid,
    token,
    access,
    userType: normalized(access.userType),
    accessLevel: normalized(access.accessLevel ?? access.role),
    accountRole: normalized(access.accountRole),
    companyId: String(access.companyId ?? access.edoId ?? '').trim(),
  };
}

export function requireTaskraft(context: AuthContext): AuthContext {
  if (context.userType !== 'taskraft') {
    throw new AuthorizationError('Taskraft access required', 403);
  }
  return context;
}

export function requireAdmin(context: AuthContext): AuthContext {
  requireTaskraft(context);
  if (!['admin', 'superadmin', 'super_admin'].includes(context.accessLevel)) {
    throw new AuthorizationError('Taskraft admin access required', 403);
  }
  return context;
}

export function requireSuperAdmin(context: AuthContext): AuthContext {
  requireTaskraft(context);
  if (!['superadmin', 'super_admin'].includes(context.accessLevel)) {
    throw new AuthorizationError('Superadmin access required', 403);
  }
  return context;
}

export function requireTaskraftAccountant(context: AuthContext): AuthContext {
  requireTaskraft(context);
  if (context.accountRole !== 'accountant' && !['superadmin', 'super_admin'].includes(context.accessLevel)) {
    throw new AuthorizationError('Taskraft accountant access required', 403);
  }
  return context;
}

export function requireEdo(context: AuthContext): AuthContext {
  if (context.userType !== 'edo' || !context.companyId) {
    throw new AuthorizationError('EDO access required', 403);
  }
  return context;
}

export function requireCompanyScope(context: AuthContext, companyId: string): AuthContext {
  requireEdo(context);
  if (!companyId || context.companyId !== companyId) {
    throw new AuthorizationError('Company access denied', 403);
  }
  return context;
}

export function authorizationStatus(error: unknown): 401 | 403 | null {
  return error instanceof AuthorizationError ? error.status : null;
}
