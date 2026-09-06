// src/lib/staff-session.ts

import crypto from 'crypto';

import {
    FieldValue,
    Timestamp,
} from 'firebase-admin/firestore';

import {
    getAdminDb,
} from '@/lib/firebase-admin';

// =====================================================
// CONFIG
// =====================================================

export const STAFF_SESSION_COOKIE =
    'bizcentral_staff_session';

const SESSION_DAYS = 7;

// =====================================================
// TYPES
// =====================================================

export type StaffSession = {
    employeeId: string;
    edoId: string;
    portalAccessId: string;
    authUid: string;
};

// =====================================================
// HELPERS
// =====================================================

function hashSessionToken(
    token: string
) {
    return crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');
}

// =====================================================
// CREATE SESSION
// =====================================================

export async function createStaffSession(
    session: StaffSession
) {
    const adminDb =
        await getAdminDb();

    const token =
        crypto
            .randomBytes(32)
            .toString('hex');

    const tokenHash =
        hashSessionToken(token);

    const expiresAt =
        Timestamp.fromMillis(
            Date.now() +
            SESSION_DAYS *
            24 *
            60 *
            60 *
            1000
        );

    await adminDb
        .collection('employeePortalSessions')
        .doc(tokenHash)
        .set({
            employeeId:
                session.employeeId,

            edoId:
                session.edoId,

            portalAccessId:
                session.portalAccessId,

            authUid:
                session.authUid,

            createdAt:
                FieldValue.serverTimestamp(),

            expiresAt,

            lastUsedAt:
                FieldValue.serverTimestamp(),
        });

    return {
        token,
        expiresAt,
    };
}

// =====================================================
// READ / VALIDATE SESSION
// =====================================================

export async function validateStaffSession(
    token: string
): Promise<StaffSession | null> {

    if (!token) {
        return null;
    }

    const adminDb =
        await getAdminDb();

    const tokenHash =
        hashSessionToken(token);

    const sessionRef =
        adminDb
            .collection(
                'employeePortalSessions'
            )
            .doc(tokenHash);

    const snapshot =
        await sessionRef.get();

    if (!snapshot.exists) {
        return null;
    }

    const data =
        snapshot.data();

    if (!data) {
        await sessionRef
            .delete()
            .catch(() => undefined);
        return null;
    }

    const expiresAt =
        data.expiresAt;

    if (
        !(expiresAt instanceof Timestamp) ||
        expiresAt.toMillis() <=
        Date.now()
    ) {
        await sessionRef
            .delete()
            .catch(() => undefined);

        return null;
    }

    const employeeId =
        typeof data.employeeId ===
            'string'
            ? data.employeeId
            : '';

    const edoId =
        typeof data.edoId ===
            'string'
            ? data.edoId
            : '';

    const portalAccessId =
        typeof data.portalAccessId ===
            'string'
            ? data.portalAccessId
            : '';

    const authUid =
        typeof data.authUid ===
            'string'
            ? data.authUid
            : '';

    if (
        !employeeId ||
        !edoId ||
        !portalAccessId ||
        !authUid
    ) {
        await sessionRef
            .delete()
            .catch(() => undefined);
        return null;
    }

    // Revalidate the access record on every request so an administrative
    // deactivation, deletion or identity relink revokes an existing session.
    const accessSnapshot =
        await adminDb
            .collection('employeePortalAccess')
            .doc(portalAccessId)
            .get();

    const accessData =
        accessSnapshot.exists
            ? accessSnapshot.data()
            : undefined;

    if (
        !accessData ||
        accessData.portalActivated !== true ||
        accessData.employeeId !== employeeId ||
        accessData.edoId !== edoId ||
        accessData.authUid !== authUid
    ) {
        await sessionRef
            .delete()
            .catch(() => undefined);
        return null;
    }

    await sessionRef
        .set(
            {
                lastUsedAt:
                    FieldValue.serverTimestamp(),
            },
            { merge: true }
        )
        .catch(() => undefined);

    return {
        employeeId,
        edoId,
        portalAccessId,
        authUid,
    };
}

// =====================================================
// DELETE SESSION
// =====================================================

export async function deleteStaffSession(
    token: string
) {
    if (!token) {
        return;
    }

    const adminDb =
        await getAdminDb();

    const tokenHash =
        hashSessionToken(token);

    await adminDb
        .collection(
            'employeePortalSessions'
        )
        .doc(tokenHash)
        .delete()
        .catch(() => undefined);
}