// src/app/api/staff/logout/route.ts

import {
    NextRequest,
    NextResponse,
} from 'next/server';

import {
    deleteStaffSession,
    STAFF_SESSION_COOKIE,
} from '@/lib/staff-session';

// =====================================================
// POST
// EMPLOYEE LOGOUT
// =====================================================

export async function POST(
    request: NextRequest
) {
    try {

        const token =
            request.cookies.get(
                STAFF_SESSION_COOKIE
            )?.value ?? '';

        if (token) {
            await deleteStaffSession(
                token
            );
        }

        const response =
            NextResponse.json(
                {
                    success: true,
                    message:
                        'Signed out successfully.',
                },
                {
                    status: 200,
                }
            );

        response.cookies.delete(
            STAFF_SESSION_COOKIE
        );

        return response;

    } catch (error: unknown) {

        console.error(
            'Staff logout failed:',
            error
        );

        // Still remove the browser cookie even if
        // Firestore session deletion failed.

        const response =
            NextResponse.json(
                {
                    success: true,
                    message:
                        'Signed out.',
                },
                {
                    status: 200,
                }
            );

        response.cookies.delete(
            STAFF_SESSION_COOKIE
        );

        return response;
    }
}