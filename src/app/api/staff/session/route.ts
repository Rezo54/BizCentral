// src/app/api/staff/session/route.ts

import {
    NextRequest,
    NextResponse,
} from 'next/server';

import {
    getAdminDb,
} from '@/lib/firebase-admin';

import {
    deleteStaffSession,
    STAFF_SESSION_COOKIE,
    validateStaffSession,
} from '@/lib/staff-session';

// =====================================================
// GET
// CURRENT EMPLOYEE SESSION
// =====================================================

export async function GET(
    request: NextRequest
) {
    try {

        // =================================================
        // READ SESSION COOKIE
        // =================================================

        const token =
            request.cookies.get(
                STAFF_SESSION_COOKIE
            )?.value ?? '';

        if (!token) {
            return NextResponse.json(
                {
                    success: false,
                    authenticated: false,
                },
                {
                    status: 401,
                }
            );
        }

        // =================================================
        // VALIDATE SERVER SESSION
        // =================================================

        const session =
            await validateStaffSession(
                token
            );

        if (!session) {
            const response =
                NextResponse.json(
                    {
                        success: false,
                        authenticated: false,
                    },
                    {
                        status: 401,
                    }
                );

            response.cookies.delete(
                STAFF_SESSION_COOKIE
            );

            return response;
        }

        // =================================================
        // LOAD EMPLOYEE
        // =================================================

        const adminDb =
            await getAdminDb();

        const employeeSnapshot =
            await adminDb
                .collection('employees')
                .doc(session.employeeId)
                .get();

        const employee =
            employeeSnapshot.exists
                ? employeeSnapshot.data()
                : undefined;

        // A valid portal session must never outlive the employee record or
        // continued employment. Revoke it rather than returning an active
        // identity backed by a stale employee document.
        if (
            !employee ||
            employee.status !== 'employed' ||
            employee.edoId !== session.edoId
        ) {
            await deleteStaffSession(token);

            const response =
                NextResponse.json(
                    {
                        success: false,
                        authenticated: false,
                    },
                    {
                        status: 401,
                    }
                );

            response.cookies.delete(
                STAFF_SESSION_COOKIE
            );

            return response;
        }

        // =================================================
        // IMPORTANT
        //
        // Return only fields that the employee portal
        // actually needs.
        // =================================================

        return NextResponse.json(
            {
                success: true,
                authenticated: true,

                employee: {
                    id:
                        session.employeeId,

                    name:
                        typeof employee.name ===
                            'string'
                            ? employee.name
                            : '',

                    surname:
                        typeof employee.surname ===
                            'string'
                            ? employee.surname
                            : '',

                    occupation:
                        typeof employee.occupation ===
                            'string'
                            ? employee.occupation
                            : '',

                    businessName:
                        typeof employee.businessName ===
                            'string'
                            ? employee.businessName
                            : '',

                    edoId:
                        session.edoId,
                },
            },
            {
                status: 200,
            }
        );

    } catch (error: unknown) {

        console.error(
            'Staff session check failed:',
            error
        );

        return NextResponse.json(
            {
                success: false,
                authenticated: false,
                message:
                    'Unable to verify your session.',
            },
            {
                status: 500,
            }
        );
    }
}