import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';

export type AccessLevel = 'standard' | 'power_user' | 'admin' | 'superadmin';
export type UserType = 'reliever' | 'edo' | 'taskraft';

export type SessionUser = {
  uid: string;
  name: string;
  email: string;
  userType: UserType;
  accessLevel: AccessLevel;
  accountRole?: string;
  edoId?: string;
  companyId?: string;
  relieverId?: string;
};

type CanonicalSessionResponse = {
  ok?: boolean;
  user?: {
    uid?: string;
    name?: string | null;
    email?: string | null;
    userType?: string;
    accessLevel?: string;
    accountRole?: string | null;
    companyId?: string | null;
  };
};

/**
 * Canonical browser session reader.
 *
 * Firebase Authentication establishes identity. Effective BizCentral access is
 * then resolved by /api/session from approved userAccess/{uid}. The browser no
 * longer reads /users to decide whether a protected app session is authorized.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const auth = getAuth();

  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      unsubscribe();

      if (!firebaseUser) {
        resolve(null);
        return;
      }

      try {
        const token = await firebaseUser.getIdToken();
        const response = await fetch('/api/session', {
          method: 'GET',
          cache: 'no-store',
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          // Defense in depth: a Firebase identity rejected by canonical
          // application authorization must not retain a browser session.
          if (response.status === 401 || response.status === 403) {
            await signOut(auth);
          }
          resolve(null);
          return;
        }

        const body = (await response.json()) as CanonicalSessionResponse;
        const user = body.user;
        if (!body.ok || !user?.uid || !user.userType || !user.accessLevel) {
          resolve(null);
          return;
        }

        resolve({
          uid: user.uid,
          name: String(user.name ?? '').trim(),
          email: String(user.email ?? firebaseUser.email ?? '').trim(),
          userType: user.userType as UserType,
          accessLevel: user.accessLevel as AccessLevel,
          accountRole: String(user.accountRole ?? '').trim().toLowerCase(),
          companyId: user.companyId ? String(user.companyId) : undefined,
        });
      } catch (error) {
        console.error('Unable to load canonical session:', error);
        resolve(null);
      }
    });
  });
}

const ACCESS_RANK: Record<AccessLevel, number> = {
  standard: 1,
  power_user: 2,
  admin: 3,
  superadmin: 4,
};

export function hasAccess(user: SessionUser, minLevel: AccessLevel) {
  return ACCESS_RANK[user.accessLevel] >= ACCESS_RANK[minLevel];
}
