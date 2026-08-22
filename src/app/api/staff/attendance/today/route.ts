// src/app/api/staff/attendance/today/route.ts

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
// TYPES
// =====================================================

type WorkWeek =
    | '5_day'
    | '6_day'
    | '';

type AttendanceStatus =
    | 'present'
    | 'absent'
    | 'off'
    | 'leave';

type AttendanceSource =
    | 'default'
    | 'attendance_exception'
    | 'approved_leave'
    | 'saturday_work'
    | 'sunday_work';

// =====================================================
// HELPERS
// =====================================================

// -----------------------------------------------------
// GET TODAY IN SOUTH AFRICA
//
// Netlify may execute in a different server timezone.
// Attendance in BizCentral is based on South African
// calendar dates.
// -----------------------------------------------------

function getSouthAfricaDate(): string {

    const formatter =
        new Intl.DateTimeFormat(
            'en-CA',
            {
                timeZone:
                    'Africa/Johannesburg',

                year:
                    'numeric',

                month:
                    '2-digit',

                day:
                    '2-digit',
            }
        );

    const parts =
        formatter.formatToParts(
            new Date()
        );

    const year =
        parts.find(
            (part) =>
                part.type === 'year'
        )?.value ?? '';

    const month =
        parts.find(
            (part) =>
                part.type === 'month'
        )?.value ?? '';

    const day =
        parts.find(
            (part) =>
                part.type === 'day'
        )?.value ?? '';

    return `${year}-${month}-${day}`;
}

// -----------------------------------------------------
// DAY OF WEEK
//
// 0 = Sunday
// 1 = Monday
// ...
// 6 = Saturday
// -----------------------------------------------------

function getDayOfWeek(
    dateString: string
) {

    return new Date(
        `${dateString}T12:00:00+02:00`
    ).getUTCDay();
}

// -----------------------------------------------------
// SCHEDULED WORKDAY
//
// Mirrors:
// src/app/(app)/people/attendance/page.tsx
//
// Monday-Friday:
//   5-day + 6-day employees scheduled.
//
// Saturday:
//   only 6-day employees scheduled.
//
// Sunday:
//   nobody scheduled by default.
// -----------------------------------------------------

function isScheduledWorkday(
    workWeek: WorkWeek,
    dateString: string
) {

    const day =
        getDayOfWeek(
            dateString
        );

    if (day === 0) {
        return false;
    }

    if (day === 6) {
        return (
            workWeek === '6_day'
        );
    }

    return (
        day >= 1 &&
        day <= 5
    );
}

// =====================================================
// GET
// EMPLOYEE PORTAL - TODAY'S ATTENDANCE
// =====================================================

export async function GET(
    request: NextRequest
) {

    try {

        // =================================================
        // STAFF SESSION
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
        // FIRESTORE ADMIN
        // =================================================

        const adminDb =
            await getAdminDb();

        // =================================================
        // EMPLOYEE RECORD
        //
        // Employee identity comes from the secure session.
        // We never accept employeeId from the browser.
        // =================================================

        const employeeSnapshot =
            await adminDb
                .collection(
                    'employees'
                )
                .doc(
                    session.employeeId
                )
                .get();

        if (
            !employeeSnapshot.exists
        ) {

            return NextResponse.json(
                {
                    success: false,
                    message:
                        'Employee record could not be found.',
                },
                {
                    status: 404,
                }
            );
        }

        const employee =
            employeeSnapshot.data();

        if (!employee) {

            return NextResponse.json(
                {
                    success: false,
                    message:
                        'Employee record could not be loaded.',
                },
                {
                    status: 404,
                }
            );
        }

        // =================================================
        // EMPLOYEE WORK WEEK
        //
        // Admin Attendance uses:
        //
        // 5_day
        // 6_day
        // =================================================

        const rawWorkWeek =
            String(
                employee.workWeek ||
                ''
            )
                .trim()
                .toLowerCase();

        const workWeek:
            WorkWeek =
            rawWorkWeek ===
                '6_day'
                ? '6_day'
                : '5_day';

        // =================================================
        // TODAY
        // =================================================

        const date =
            getSouthAfricaDate();

        const dayOfWeek =
            getDayOfWeek(
                date
            );

        const sunday =
            dayOfWeek === 0;

        const saturday =
            dayOfWeek === 6;

        const fiveDaySaturday =
            saturday &&
            workWeek !== '6_day';

        const scheduled =
            isScheduledWorkday(
                workWeek,
                date
            );

        // =================================================
        // DEFAULT STATUS
        //
        // Same principle as Admin Attendance:
        //
        // Scheduled day + no exception = Present
        //
        // Non-scheduled day = Off unless explicit work
        // record exists.
        // =================================================

        let status:
            AttendanceStatus =
            scheduled
                ? 'present'
                : 'off';

        let source:
            AttendanceSource =
            'default';

        let reason =
            '';

        let notes =
            '';

        let leaveType =
            '';

        // =================================================
        // SATURDAY WORK
        //
        // A 5-day employee is OFF on Saturday unless an
        // explicit attendanceRecords/saturday_work record
        // exists.
        //
        // This mirrors the Admin Attendance register.
        // =================================================

        if (
            fiveDaySaturday
        ) {

            const saturdayWorkId =
                `${session.employeeId}_${date}_saturday_work`;

            const saturdaySnapshot =
                await adminDb
                    .collection(
                        'attendanceRecords'
                    )
                    .doc(
                        saturdayWorkId
                    )
                    .get();

            if (
                saturdaySnapshot.exists
            ) {

                const saturdayData =
                    saturdaySnapshot.data();

                if (
                    String(
                        saturdayData
                            ?.recordType ||
                        ''
                    )
                        .trim()
                        .toLowerCase() ===
                    'saturday_work'
                ) {

                    status =
                        'present';

                    source =
                        'saturday_work';

                    notes =
                        String(
                            saturdayData
                                ?.notes ||
                            ''
                        );
                }
            }
        }

        // =================================================
        // SUNDAY WORK
        //
        // Sunday is OFF unless an explicit sunday_work
        // attendance record exists.
        // =================================================

        if (sunday) {

            const sundayWorkId =
                `${session.employeeId}_${date}_sunday_work`;

            const sundaySnapshot =
                await adminDb
                    .collection(
                        'attendanceRecords'
                    )
                    .doc(
                        sundayWorkId
                    )
                    .get();

            if (
                sundaySnapshot.exists
            ) {

                const sundayData =
                    sundaySnapshot.data();

                if (
                    String(
                        sundayData
                            ?.recordType ||
                        ''
                    )
                        .trim()
                        .toLowerCase() ===
                    'sunday_work'
                ) {

                    status =
                        'present';

                    source =
                        'sunday_work';

                    notes =
                        String(
                            sundayData
                                ?.notes ||
                            ''
                        );
                }
            }
        }

        // =================================================
        // APPROVED LEAVE
        //
        // Admin Attendance only applies leave to scheduled
        // workdays.
        //
        // Therefore:
        //
        // 5-day Saturday remains Off.
        // Sunday remains Off.
        // =================================================

        if (scheduled) {

            const leaveSnapshot =
                await adminDb
                    .collection(
                        'leaveRequests'
                    )
                    .where(
                        'employeeId',
                        '==',
                        session.employeeId
                    )
                    .where(
                        'status',
                        '==',
                        'approved'
                    )
                    .get();

            const approvedLeave =
                leaveSnapshot.docs.find(
                    (leaveDoc) => {

                        const data =
                            leaveDoc.data();

                        const fromDate =
                            String(
                                data.fromDate ||
                                ''
                            );

                        const toDate =
                            String(
                                data.toDate ||
                                ''
                            );

                        return (
                            !!fromDate &&
                            !!toDate &&
                            fromDate <=
                            date &&
                            toDate >=
                            date
                        );
                    }
                );

            if (approvedLeave) {

                const leave =
                    approvedLeave.data();

                status =
                    'leave';

                source =
                    'approved_leave';

                leaveType =
                    String(
                        leave.leaveType ||
                        leave.type ||
                        ''
                    );

                reason =
                    leaveType;

                notes =
                    String(
                        leave.notes ||
                        leave.reason ||
                        ''
                    );
            }
        }

        // =================================================
        // ATTENDANCE EXCEPTION
        //
        // Admin Attendance stores normal absences as:
        //
        // attendanceExceptions/{employeeId}_{date}
        //
        // Only scheduled workdays use absence exceptions.
        //
        // Approved leave takes precedence in the Admin
        // Attendance view, so we only apply an absence
        // when the employee is not already on leave.
        // =================================================

        if (
            scheduled &&
            status !== 'leave'
        ) {

            const exceptionId =
                `${session.employeeId}_${date}`;

            const exceptionSnapshot =
                await adminDb
                    .collection(
                        'attendanceExceptions'
                    )
                    .doc(
                        exceptionId
                    )
                    .get();

            if (
                exceptionSnapshot.exists
            ) {

                const exception =
                    exceptionSnapshot.data();

                status =
                    'absent';

                source =
                    'attendance_exception';

                reason =
                    String(
                        exception
                            ?.reason ||
                        ''
                    );

                notes =
                    String(
                        exception
                            ?.notes ||
                        ''
                    );
            }
        }

        // =================================================
        // RESPONSE
        // =================================================

        return NextResponse.json(
            {
                success: true,

                attendance: {
                    date,

                    status,

                    workWeek,

                    scheduled,

                    source,

                    reason,

                    notes,

                    leaveType,
                },
            },
            {
                status: 200,
            }
        );

    } catch (
    error: unknown
    ) {

        console.error(
            'Staff today attendance failed:',
            error
        );

        return NextResponse.json(
            {
                success: false,

                message:
                    'Unable to load today\'s attendance.',
            },
            {
                status: 500,
            }
        );
    }
}