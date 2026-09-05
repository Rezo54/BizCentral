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
// SECURITY SETTINGS
// =====================================================

const OTP_COOLDOWN_SECONDS = 60;
const OTP_WINDOW_MINUTES = 15;
const OTP_MAX_PER_WINDOW = 3;
const OTP_BLOCK_MINUTES = 30;
const OTP_MAX_PER_DAY = 10;

const ID_VERIFY_MAX_FAILURES = 5;
const ID_VERIFY_WINDOW_MINUTES = 15;
const ID_VERIFY_BLOCK_MINUTES = 30;

// =====================================================
// GENERIC VERIFICATION FAILURE
// =====================================================

function verificationFailed() {
  return NextResponse.json(
    {
      success: false,
      code: 'VERIFICATION_FAILED',
      message:
        'We could not verify your employee details. Please check the information entered or contact your administrator.',
    },
    { status: 400 }
  );
}

function verificationBlocked() {
  return NextResponse.json(
    {
      success: false,
      code: 'VERIFICATION_BLOCKED',
      message:
        'Too many verification attempts. Please try again later.',
    },
    { status: 429 }
  );
}

// =====================================================
// POST
// =====================================================

export async function POST(
  request: Request
) {
  try {
    const adminDb =
      await getAdminDb();

    const body =
      await request.json();

    const cellphone =
      normalizeCellphone(
        String(body.cellphone || '')
      );

    const idLastSix =
      String(body.idLastSix || '')
        .replace(/\D/g, '');

    if (
      !/^27\d{9}$/.test(cellphone) ||
      !/^\d{6}$/.test(idLastSix)
    ) {
      return verificationFailed();
    }

    const localCellphone =
      cellphoneToLocal(cellphone);

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

    if (employee.status !== 'employed') {
      return verificationFailed();
    }

    const fullIdNumber =
      String(employee.idNumber || '')
        .replace(/\D/g, '');

    if (fullIdNumber.length < 6) {
      console.error(
        'Employee ID number is missing or invalid:',
        employeeId
      );
      return verificationFailed();
    }

    const actualLastSix =
      fullIdNumber.slice(-6);

    const expectedHash =
      createIdVerificationHash(
        employeeId,
        actualLastSix
      );

    const enteredHash =
      createIdVerificationHash(
        employeeId,
        idLastSix
      );

    const idMatches =
      safeHashCompare(
        expectedHash,
        enteredHash
      );

    const portalRef =
      adminDb
        .collection('employeePortalAccess')
        .doc(employeeId);

    const now = Timestamp.now();

    // All account-specific identity and OTP throttling is performed in one
    // transaction so concurrent requests cannot bypass either control.
    const result =
      await adminDb.runTransaction(
        async (transaction) => {
          const portalSnap =
            await transaction.get(portalRef);

          const portalData =
            portalSnap.exists
              ? portalSnap.data()
              : undefined;

          if (
            portalData?.portalActivated === true
          ) {
            return {
              allowed: false,
              code: 'ALREADY_ACTIVATED',
              status: 409,
              message:
                'Your Employee Portal account is already activated. Please login or use Forgot PIN.',
            };
          }

          // =============================================
          // ID VERIFICATION BRUTE-FORCE CONTROL
          // =============================================

          const idBlockedUntil =
            portalData?.idVerifyBlockedUntil;

          if (
            idBlockedUntil instanceof Timestamp &&
            idBlockedUntil.toMillis() > now.toMillis()
          ) {
            return {
              allowed: false,
              code: 'VERIFICATION_BLOCKED',
              status: 429,
              message:
                'Too many verification attempts. Please try again later.',
            };
          }

          let idVerifyFailureCount =
            Number(
              portalData?.idVerifyFailureCount || 0
            );

          let idVerifyWindowStartedAt =
            portalData?.idVerifyWindowStartedAt;

          const idWindowExpired =
            !(idVerifyWindowStartedAt instanceof Timestamp) ||
            (
              now.toMillis() -
              idVerifyWindowStartedAt.toMillis()
            ) >
              ID_VERIFY_WINDOW_MINUTES * 60 * 1000;

          if (idWindowExpired) {
            idVerifyFailureCount = 0;
            idVerifyWindowStartedAt = now;
          }

          if (!idMatches) {
            const nextFailures =
              idVerifyFailureCount + 1;

            const shouldBlock =
              nextFailures >=
              ID_VERIFY_MAX_FAILURES;

            transaction.set(
              portalRef,
              {
                employeeId,
                edoId:
                  employee.edoId || null,
                cellphoneNormalized:
                  cellphone,
                portalActivated:
                  portalData?.portalActivated === true,
                idVerifyFailureCount:
                  shouldBlock ? 0 : nextFailures,
                idVerifyWindowStartedAt,
                idVerifyBlockedUntil:
                  shouldBlock
                    ? Timestamp.fromMillis(
                        now.toMillis() +
                        ID_VERIFY_BLOCK_MINUTES *
                          60 * 1000
                      )
                    : null,
                lastIdVerifyFailedAt: now,
                updatedAt:
                  FieldValue.serverTimestamp(),
                ...(
                  portalSnap.exists
                    ? {}
                    : {
                        createdAt:
                          FieldValue.serverTimestamp(),
                      }
                ),
              },
              { merge: true }
            );

            return {
              allowed: false,
              code:
                shouldBlock
                  ? 'VERIFICATION_BLOCKED'
                  : 'VERIFICATION_FAILED',
              status:
                shouldBlock ? 429 : 400,
              message:
                shouldBlock
                  ? 'Too many verification attempts. Please try again later.'
                  : 'We could not verify your employee details. Please check the information entered or contact your administrator.',
            };
          }

          // A correct ID cannot bypass an existing block (checked above).
          // Once the block has expired, successful verification clears the
          // failed-identity state before normal OTP throttling proceeds.

          const blockedUntil =
            portalData?.otpBlockedUntil;

          if (
            blockedUntil instanceof Timestamp &&
            blockedUntil.toMillis() > now.toMillis()
          ) {
            return {
              allowed: false,
              code: 'OTP_BLOCKED',
              status: 429,
              message:
                'Too many verification requests. Please try again later.',
            };
          }

          const lastOtpRequestedAt =
            portalData?.lastOtpRequestedAt;

          if (
            lastOtpRequestedAt instanceof Timestamp
          ) {
            const elapsedSeconds =
              (
                now.toMillis() -
                lastOtpRequestedAt.toMillis()
              ) / 1000;

            if (
              elapsedSeconds <
              OTP_COOLDOWN_SECONDS
            ) {
              return {
                allowed: false,
                code: 'OTP_COOLDOWN',
                status: 429,
                message:
                  'Please wait before requesting another verification code.',
              };
            }
          }

          let otpRequestCount =
            Number(
              portalData?.otpRequestCount || 0
            );

          let otpWindowStartedAt =
            portalData?.otpWindowStartedAt;

          const otpWindowExpired =
            !(otpWindowStartedAt instanceof Timestamp) ||
            (
              now.toMillis() -
              otpWindowStartedAt.toMillis()
            ) >
              OTP_WINDOW_MINUTES * 60 * 1000;

          if (otpWindowExpired) {
            otpRequestCount = 0;
            otpWindowStartedAt = now;
          }

          if (
            otpRequestCount >=
            OTP_MAX_PER_WINDOW
          ) {
            const blockUntil =
              Timestamp.fromMillis(
                now.toMillis() +
                OTP_BLOCK_MINUTES *
                  60 * 1000
              );

            transaction.set(
              portalRef,
              {
                otpBlockedUntil: blockUntil,
                updatedAt:
                  FieldValue.serverTimestamp(),
              },
              { merge: true }
            );

            return {
              allowed: false,
              code: 'OTP_BLOCKED',
              status: 429,
              message:
                'Too many verification requests. Please try again later.',
            };
          }

          let otpDailyCount =
            Number(
              portalData?.otpDailyCount || 0
            );

          let otpDailyStartedAt =
            portalData?.otpDailyStartedAt;

          const dailyWindowExpired =
            !(otpDailyStartedAt instanceof Timestamp) ||
            (
              now.toMillis() -
              otpDailyStartedAt.toMillis()
            ) >
              24 * 60 * 60 * 1000;

          if (dailyWindowExpired) {
            otpDailyCount = 0;
            otpDailyStartedAt = now;
          }

          if (
            otpDailyCount >=
            OTP_MAX_PER_DAY
          ) {
            return {
              allowed: false,
              code: 'OTP_DAILY_LIMIT',
              status: 429,
              message:
                'The daily verification limit has been reached. Please try again later.',
            };
          }

          transaction.set(
            portalRef,
            {
              employeeId,
              edoId:
                employee.edoId || null,
              cellphoneNormalized:
                cellphone,
              idVerificationHash:
                expectedHash,
              portalActivated: false,
              authUid:
                portalData?.authUid || null,
              idVerifyFailureCount: 0,
              idVerifyWindowStartedAt:
                FieldValue.delete(),
              idVerifyBlockedUntil:
                FieldValue.delete(),
              otpRequestCount:
                otpRequestCount + 1,
              otpWindowStartedAt,
              otpDailyCount:
                otpDailyCount + 1,
              otpDailyStartedAt,
              lastOtpRequestedAt: now,
              otpBlockedUntil: null,
              updatedAt:
                FieldValue.serverTimestamp(),
              ...(
                portalSnap.exists
                  ? {}
                  : {
                      createdAt:
                        FieldValue.serverTimestamp(),
                    }
              ),
            },
            { merge: true }
          );

          return {
            allowed: true,
            code: 'OTP_ALLOWED',
            status: 200,
          };
        }
      );

    if (!result.allowed) {
      if (
        result.code === 'VERIFICATION_FAILED'
      ) {
        return verificationFailed();
      }

      if (
        result.code === 'VERIFICATION_BLOCKED'
      ) {
        return verificationBlocked();
      }

      return NextResponse.json(
        {
          success: false,
          code: result.code,
          message: result.message,
        },
        { status: result.status }
      );
    }

    return NextResponse.json(
      {
        success: true,
        code: 'OTP_ALLOWED',
        cellphone: `+${cellphone}`,
        employeeId,
      },
      { status: 200 }
    );

  } catch (error: unknown) {
    console.error(
      'Employee activation check failed:',
      error
    );

    return NextResponse.json(
      {
        success: false,
        code: 'SERVER_ERROR',
        message:
          'Unable to process activation at this time.',
      },
      { status: 500 }
    );
  }
}
