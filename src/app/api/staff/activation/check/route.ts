// src/app/api/staff/activation/check/route.ts

import { NextResponse } from 'next/server';

import {
  FieldValue,
  Timestamp,
} from 'firebase-admin/firestore';

import { getAdminDb } from '@/lib/firebase-admin';

import {
  cellphoneToLocal,
  createIdVerificationHash,
  normalizeCellphone,
  safeHashCompare,
} from '@/lib/employee-security';

// =====================================================
// OTP SECURITY SETTINGS
// =====================================================

const OTP_COOLDOWN_SECONDS = 60;

const OTP_WINDOW_MINUTES = 15;
const OTP_MAX_PER_WINDOW = 3;

const OTP_BLOCK_MINUTES = 30;

const OTP_MAX_PER_DAY = 10;

// =====================================================
// GENERIC VERIFICATION FAILURE
//
// Don't reveal whether:
// - cellphone exists
// - ID exists
// - employee exists
// =====================================================

function verificationFailed() {
  return NextResponse.json(
    {
      success: false,
      code: 'VERIFICATION_FAILED',
      message:
        'We could not verify your employee details. Please check the information entered or contact your administrator.',
    },
    {
      status: 400,
    }
  );
}

// =====================================================
// POST
// =====================================================

export async function POST(
  request: Request
) {
  try {

    // =================================================
    // FIREBASE ADMIN
    //
    // Initialise inside the request so that any
    // configuration error is caught by this route's
    // try/catch instead of crashing during module load.
    // =================================================

    const adminDb =
      await getAdminDb();

    // =================================================
    // READ REQUEST
    // =================================================

    const body =
      await request.json();

    const cellphone =
      normalizeCellphone(
        String(
          body.cellphone || ''
        )
      );

    const idLastSix =
      String(
        body.idLastSix || ''
      ).replace(/\D/g, '');

    // =================================================
    // BASIC INPUT VALIDATION
    // =================================================

    if (
      !/^27\d{9}$/.test(cellphone) ||
      !/^\d{6}$/.test(idLastSix)
    ) {
      return verificationFailed();
    }

    // =================================================
    // CONVERT TO EXISTING EMPLOYEE FORMAT
    //
    // Firestore employees currently store:
    //
    // 0631234567
    //
    // rather than:
    //
    // 27631234567
    // =================================================

    const localCellphone =
      cellphoneToLocal(cellphone);

    // =================================================
    // FIND EMPLOYEE
    // =================================================

    const employeeQuery =
      await adminDb
        .collection('employees')
        .where(
          'cellphone',
          '==',
          localCellphone
        )
        .limit(2)
        .get();

    if (employeeQuery.empty) {
      return verificationFailed();
    }

    // Cellphone must uniquely identify one employee.

    if (employeeQuery.size !== 1) {

      console.error(
        'Duplicate employee cellphone detected.'
      );

      return verificationFailed();
    }

    const employeeDoc =
      employeeQuery.docs[0];

    const employee =
      employeeDoc.data();

    const employeeId =
      employeeDoc.id;

    // =================================================
    // EMPLOYMENT STATUS
    // =================================================

    if (
      employee.status !== 'employed'
    ) {
      return verificationFailed();
    }

    // =================================================
    // AUTHORITATIVE ID
    //
    // This remains server-side.
    // It is NEVER returned to the browser.
    // =================================================

    const fullIdNumber =
      String(
        employee.idNumber || ''
      ).replace(/\D/g, '');

    if (
      fullIdNumber.length < 6
    ) {
      console.error(
        'Employee ID number is missing or invalid:',
        employeeId
      );

      return verificationFailed();
    }

    const actualLastSix =
      fullIdNumber.slice(-6);

    // =================================================
    // CREATE EXPECTED HMAC
    // =================================================

    const expectedHash =
      createIdVerificationHash(
        employeeId,
        actualLastSix
      );

    // =================================================
    // CREATE HMAC FROM ENTERED VALUE
    // =================================================

    const enteredHash =
      createIdVerificationHash(
        employeeId,
        idLastSix
      );

    // =================================================
    // CONSTANT-TIME COMPARISON
    // =================================================

    if (
      !safeHashCompare(
        expectedHash,
        enteredHash
      )
    ) {
      return verificationFailed();
    }

    // =================================================
    // PORTAL ACCESS RECORD
    // =================================================

    const portalRef =
      adminDb
        .collection(
          'employeePortalAccess'
        )
        .doc(employeeId);

    const now =
      Timestamp.now();

    // =================================================
    // TRANSACTION
    //
    // This prevents two simultaneous requests from
    // bypassing our OTP counters.
    // =================================================

    const result =
      await adminDb.runTransaction(
        async (transaction) => {

          const portalSnap =
            await transaction.get(
              portalRef
            );

          const portalData =
            portalSnap.exists
              ? portalSnap.data()
              : undefined;

          // =============================================
          // ALREADY ACTIVATED
          // =============================================

          if (
            portalData
              ?.portalActivated === true
          ) {
            return {
              allowed: false,
              code:
                'ALREADY_ACTIVATED',
              status: 409,

              message:
                'Your Employee Portal account is already activated. Please login or use Forgot PIN.',
            };
          }

          // =============================================
          // CURRENT OTP BLOCK
          // =============================================

          const blockedUntil =
            portalData
              ?.otpBlockedUntil;

          if (
            blockedUntil &&
            blockedUntil.toMillis() >
              now.toMillis()
          ) {
            return {
              allowed: false,
              code:
                'OTP_BLOCKED',
              status: 429,

              message:
                'Too many verification requests. Please try again later.',
            };
          }

          // =============================================
          // 60 SECOND COOLDOWN
          // =============================================

          const lastOtpRequestedAt =
            portalData
              ?.lastOtpRequestedAt;

          if (lastOtpRequestedAt) {

            const elapsedSeconds =
              (
                now.toMillis() -
                lastOtpRequestedAt
                  .toMillis()
              ) / 1000;

            if (
              elapsedSeconds <
              OTP_COOLDOWN_SECONDS
            ) {
              return {
                allowed: false,
                code:
                  'OTP_COOLDOWN',
                status: 429,

                message:
                  'Please wait before requesting another verification code.',
              };
            }
          }

          // =============================================
          // 15 MINUTE WINDOW
          // =============================================

          let otpRequestCount =
            Number(
              portalData
                ?.otpRequestCount ||
                0
            );

          let otpWindowStartedAt =
            portalData
              ?.otpWindowStartedAt;

          const otpWindowExpired =
            !otpWindowStartedAt ||
            (
              now.toMillis() -
              otpWindowStartedAt
                .toMillis()
            ) >
              OTP_WINDOW_MINUTES *
                60 *
                1000;

          if (otpWindowExpired) {

            otpRequestCount = 0;

            otpWindowStartedAt =
              now;
          }

          // =============================================
          // WINDOW LIMIT
          // =============================================

          if (
            otpRequestCount >=
            OTP_MAX_PER_WINDOW
          ) {

            const blockUntil =
              Timestamp.fromMillis(
                now.toMillis() +
                  OTP_BLOCK_MINUTES *
                    60 *
                    1000
              );

            transaction.set(
              portalRef,
              {
                otpBlockedUntil:
                  blockUntil,

                updatedAt:
                  FieldValue
                    .serverTimestamp(),
              },
              {
                merge: true,
              }
            );

            return {
              allowed: false,
              code:
                'OTP_BLOCKED',
              status: 429,

              message:
                'Too many verification requests. Please try again later.',
            };
          }

          // =============================================
          // DAILY WINDOW
          // =============================================

          let otpDailyCount =
            Number(
              portalData
                ?.otpDailyCount ||
                0
            );

          let otpDailyStartedAt =
            portalData
              ?.otpDailyStartedAt;

          const dailyWindowExpired =
            !otpDailyStartedAt ||
            (
              now.toMillis() -
              otpDailyStartedAt
                .toMillis()
            ) >
              24 *
                60 *
                60 *
                1000;

          if (dailyWindowExpired) {

            otpDailyCount = 0;

            otpDailyStartedAt =
              now;
          }

          // =============================================
          // DAILY LIMIT
          // =============================================

          if (
            otpDailyCount >=
            OTP_MAX_PER_DAY
          ) {
            return {
              allowed: false,
              code:
                'OTP_DAILY_LIMIT',
              status: 429,

              message:
                'The daily verification limit has been reached. Please try again later.',
            };
          }

          // =============================================
          // CREATE / UPDATE PORTAL ACCESS
          // =============================================

          const portalRecord = {

            employeeId,

            edoId:
              employee.edoId ||
              null,

            cellphoneNormalized:
              cellphone,

            // HMAC only.
            // Never store raw last 6 digits.
            idVerificationHash:
              expectedHash,

            portalActivated:
              false,

            authUid:
              portalData
                ?.authUid ||
              null,

            // OTP counters
            otpRequestCount:
              otpRequestCount + 1,

            otpWindowStartedAt,

            otpDailyCount:
              otpDailyCount + 1,

            otpDailyStartedAt,

            lastOtpRequestedAt:
              now,

            // Previous block has expired,
            // therefore clear it.
            otpBlockedUntil:
              null,

            updatedAt:
              FieldValue
                .serverTimestamp(),

            ...(
              portalSnap.exists
                ? {}
                : {
                    createdAt:
                      FieldValue
                        .serverTimestamp(),
                  }
            ),
          };

          transaction.set(
            portalRef,
            portalRecord,
            {
              merge: true,
            }
          );

          return {
            allowed: true,
            code: 'OTP_ALLOWED',
            status: 200,
          };
        }
      );

    // =================================================
    // BLOCKED / NOT ALLOWED
    // =================================================

    if (!result.allowed) {

      return NextResponse.json(
        {
          success: false,
          code:
            result.code,
          message:
            result.message,
        },
        {
          status:
            result.status,
        }
      );
    }

    // =================================================
    // SUCCESS
    //
    // Employee has passed:
    //
    // ✓ cellphone
    // ✓ employee status
    // ✓ ID HMAC
    // ✓ OTP cooldown
    // ✓ OTP request window
    // ✓ daily limit
    //
    // Firebase SMS is NOT sent here yet.
    // =================================================

    return NextResponse.json(
      {
        success: true,
        code: 'OTP_ALLOWED',

        cellphone:
          `+${cellphone}`,

        employeeId,
      },
      {
        status: 200,
      }
    );

  } catch (error: any) {

    console.error(
      'Employee activation check failed:',
      error
    );

    return NextResponse.json(
      {
        success: false,
        code:
          'SERVER_ERROR',

        message:
          'Unable to process activation at this time.',
      },
      {
        status: 500,
      }
    );
  }
}