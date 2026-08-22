// src/app/api/staff/login/route.ts

import {
    NextRequest,
    NextResponse,
} from 'next/server';

import {
    createStaffSession,
    STAFF_SESSION_COOKIE,
} from '@/lib/staff-session';

import {
    FieldValue,
    Timestamp,
} from 'firebase-admin/firestore';

import bcrypt from 'bcryptjs';

import {
    getAdminDb,
} from '@/lib/firebase-admin';

// =====================================================
// CONFIG
// =====================================================

const MAX_FAILED_ATTEMPTS = 5;

const LOCKOUT_MINUTES = 15;

// =====================================================
// HELPERS
// =====================================================

function normalizePhone(
    value: string
) {
    const digits =
        value.replace(/\D/g, '');

    // South African local number:
    // 0821234567 -> 27821234567

    if (
        /^0\d{9}$/.test(digits)
    ) {
        return `27${digits.substring(1)}`;
    }

    // Already international without +
    // 27821234567

    if (
        /^27\d{9}$/.test(digits)
    ) {
        return digits;
    }

    return digits;
}

// =====================================================
// POST
// EMPLOYEE CELLPHONE + PIN LOGIN
// =====================================================

export async function POST(
    request: NextRequest
) {
    try {

        // =================================================
        // READ REQUEST
        // =================================================

        const body =
            await request.json();

        const cellphone =
            typeof body?.cellphone === 'string'
                ? body.cellphone.trim()
                : '';

        const pin =
            typeof body?.pin === 'string'
                ? body.pin.trim()
                : '';

        // =================================================
        // BASIC VALIDATION
        // =================================================

        const cellphoneNormalized =
            normalizePhone(cellphone);

        if (
            !/^27\d{9}$/.test(
                cellphoneNormalized
            )
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        'Please enter a valid South African cellphone number.',
                },
                {
                    status: 400,
                }
            );
        }

        if (!/^\d{6}$/.test(pin)) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        'PIN must be exactly 6 digits.',
                },
                {
                    status: 400,
                }
            );
        }

        // =================================================
        // FIRESTORE
        // =================================================

        const adminDb =
            await getAdminDb();

        // =================================================
        // FIND EMPLOYEE PORTAL ACCOUNT
        // =================================================

        const portalQuery =
            await adminDb
                .collection(
                    'employeePortalAccess'
                )
                .where(
                    'cellphoneNormalized',
                    '==',
                    cellphoneNormalized
                )
                .limit(2)
                .get();

        // Do not reveal whether a cellphone number exists.
        if (
            portalQuery.docs.length !== 1
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        'Invalid cellphone number or PIN.',
                },
                {
                    status: 401,
                }
            );
        }

        const portalDoc =
            portalQuery.docs[0];

        const portalData =
            portalDoc.data();

        // =================================================
        // ACTIVATION CHECK
        // =================================================

        if (
            portalData.portalActivated !==
            true
        ) {
            return NextResponse.json(
                {
                    success: false,
                    code:
                        'NOT_ACTIVATED',
                    message:
                        'This Employee Portal account has not been activated.',
                },
                {
                    status: 403,
                }
            );
        }

        // =================================================
        // REQUIRED ACCOUNT DATA
        // =================================================

        const pinHash =
            typeof portalData.pinHash ===
                'string'
                ? portalData.pinHash
                : '';

        const employeeId =
            typeof portalData.employeeId ===
                'string'
                ? portalData.employeeId
                : '';

        const edoId =
            typeof portalData.edoId ===
                'string'
                ? portalData.edoId
                : '';

        const authUid =
            typeof portalData.authUid ===
                'string'
                ? portalData.authUid
                : '';

        if (
            !pinHash ||
            !employeeId ||
            !edoId ||
            !authUid
        ) {
            console.error(
                'Employee portal account is incomplete:',
                portalDoc.id
            );

            return NextResponse.json(
                {
                    success: false,
                    message:
                        'Unable to sign in. Please contact your administrator.',
                },
                {
                    status: 500,
                }
            );
        }

        // =================================================
        // LOCKOUT CHECK
        // =================================================

        const loginBlockedUntil =
            portalData.loginBlockedUntil;

        if (
            loginBlockedUntil instanceof
            Timestamp &&
            loginBlockedUntil.toMillis() >
            Date.now()
        ) {
            const remainingMs =
                loginBlockedUntil.toMillis() -
                Date.now();

            const remainingMinutes =
                Math.max(
                    1,
                    Math.ceil(
                        remainingMs /
                        60000
                    )
                );

            return NextResponse.json(
                {
                    success: false,
                    code:
                        'LOGIN_BLOCKED',
                    message:
                        `Too many incorrect attempts. Please try again in ${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'}.`,
                },
                {
                    status: 429,
                }
            );
        }

        // =================================================
        // VERIFY PIN
        // =================================================

        const pinValid =
            await bcrypt.compare(
                pin,
                pinHash
            );

        // =================================================
        // INCORRECT PIN
        // =================================================

        if (!pinValid) {

            await adminDb.runTransaction(
                async (transaction) => {

                    const currentSnapshot =
                        await transaction.get(
                            portalDoc.ref
                        );

                    if (
                        !currentSnapshot.exists
                    ) {
                        return;
                    }

                    const current =
                        currentSnapshot.data();

                    const currentBlockedUntil =
                        current
                            ?.loginBlockedUntil;

                    // Another request may already have
                    // locked the account.

                    if (
                        currentBlockedUntil instanceof
                        Timestamp &&
                        currentBlockedUntil.toMillis() >
                        Date.now()
                    ) {
                        return;
                    }

                    const currentAttempts =
                        typeof current
                            ?.failedLoginAttempts ===
                            'number'
                            ? current
                                .failedLoginAttempts
                            : 0;

                    const nextAttempts =
                        currentAttempts + 1;

                    // ---------------------------------------------
                    // LOCK ACCOUNT
                    // ---------------------------------------------

                    if (
                        nextAttempts >=
                        MAX_FAILED_ATTEMPTS
                    ) {
                        const blockedUntil =
                            Timestamp.fromMillis(
                                Date.now() +
                                LOCKOUT_MINUTES *
                                60 *
                                1000
                            );

                        transaction.update(
                            portalDoc.ref,
                            {
                                failedLoginAttempts:
                                    0,

                                loginBlockedUntil:
                                    blockedUntil,

                                lastFailedLoginAt:
                                    FieldValue
                                        .serverTimestamp(),

                                updatedAt:
                                    FieldValue
                                        .serverTimestamp(),
                            }
                        );

                        return;
                    }

                    // ---------------------------------------------
                    // RECORD FAILED ATTEMPT
                    // ---------------------------------------------

                    transaction.update(
                        portalDoc.ref,
                        {
                            failedLoginAttempts:
                                nextAttempts,

                            lastFailedLoginAt:
                                FieldValue
                                    .serverTimestamp(),

                            updatedAt:
                                FieldValue
                                    .serverTimestamp(),
                        }
                    );
                }
            );

            return NextResponse.json(
                {
                    success: false,
                    message:
                        'Invalid cellphone number or PIN.',
                },
                {
                    status: 401,
                }
            );
        }

        // =================================================
        // SUCCESSFUL PIN
        //
        // Clear previous failed-login state.
        // =================================================

        await portalDoc.ref.update({
            failedLoginAttempts: 0,

            loginBlockedUntil:
                FieldValue.delete(),

            lastLoginAt:
                FieldValue.serverTimestamp(),

            updatedAt:
                FieldValue.serverTimestamp(),
        });

        // =================================================
        // CREATE SECURE STAFF SESSION
        // =================================================

        const session =
            await createStaffSession({
                employeeId,
                edoId,
                portalAccessId:
                    portalDoc.id,
                authUid,
            });

        // =================================================
        // RESPONSE
        // =================================================

        const response =
            NextResponse.json(
                {
                    success: true,
                    message:
                        'Signed in successfully.',
                },
                {
                    status: 200,
                }
            );

        // =================================================
        // HTTPONLY SESSION COOKIE
        //
        // JavaScript running in the browser cannot read this
        // cookie.
        // =================================================

        response.cookies.set(
            STAFF_SESSION_COOKIE,
            session.token,
            {
                httpOnly: true,

                secure:
                    process.env.NODE_ENV ===
                    'production',

                sameSite: 'lax',

                path: '/',

                expires:
                    session.expiresAt.toDate(),
            }
        );

        return response;

    } catch (error: unknown) {

        // =================================================
        // SERVER ERROR
        // =================================================

        console.error(
            'Employee login failed:',
            error
        );

        return NextResponse.json(
            {
                success: false,
                message:
                    'Unable to sign in. Please try again.',
            },
            {
                status: 500,
            }
        );
    }
}