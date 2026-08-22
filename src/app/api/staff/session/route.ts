// src/app/api/staff/session/route.ts

import {
    NextRequest,
    NextResponse,
} from 'next/server';

import {
    getAdminDb,
} from '@/lib/firebase-admin';

import {
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

        if (!employeeSnapshot.exists) {
            return NextResponse.json(
                {
                    success: false,
                    authenticated: false,
                    message:
                        'Employee record could not be found.',
                },
                {
                    status: 401,
                }
            );
        }

        const employee =
            employeeSnapshot.data();

        if (!employee) {
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