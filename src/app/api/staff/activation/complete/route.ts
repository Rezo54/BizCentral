// src/app/api/staff/activation/complete/route.ts

import {
  createHash,
  timingSafeEqual,
} from 'crypto';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  FieldValue,
  Timestamp,
} from 'firebase-admin/firestore';

import bcrypt from 'bcryptjs';

import {
  getAdminAuth,
  getAdminDb,
} from '@/lib/firebase-admin';

// =====================================================
// CONFIG
// =====================================================

const PIN_ROUNDS = 12;
const PROOF_COOKIE =
  'bizcentral_activation_proof';

// =====================================================
// HELPERS
// =====================================================

function normalizePhone(
  value: string
) {
  return value.replace(/\D/g, '');
}

function hashProof(value: string) {
  return createHash('sha256')
    .update(value)
    .digest('hex');
}

function safeEqualHex(
  a: string,
  b: string
) {
  try {
    const x = Buffer.from(a, 'hex');
    const y = Buffer.from(b, 'hex');
    return x.length === y.length &&
      timingSafeEqual(x, y);
  } catch {
    return false;
  }
}

// =====================================================
// POST
// COMPLETE EMPLOYEE PORTAL ACTIVATION
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

    const idToken =
      typeof body?.idToken === 'string'
        ? body.idToken.trim()
        : '';

    const pin =
      typeof body?.pin === 'string'
        ? body.pin.trim()
        : '';

    const rawProof =
      request.cookies.get(
        PROOF_COOKIE
      )?.value || '';

    // =================================================
    // BASIC VALIDATION
    // =================================================

    if (!idToken || !rawProof) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Your activation verification has expired. Please start activation again.',
        },
        {
          status: 401,
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
    // FIREBASE ADMIN
    // =================================================

    const adminAuth =
      await getAdminAuth();
  
    const adminDb =
      await getAdminDb();

    // =================================================
    // VERIFY FIREBASE ID TOKEN
    //
    // We do NOT trust a UID or cellphone supplied
    // directly by the browser.
    // =================================================

    let decodedToken;

    try {
      decodedToken =
        await adminAuth.verifyIdToken(
          idToken
        );
    } catch {
      return NextResponse.json(
        {
          success: false,
          message:
            'Your verification session is invalid or has expired. Please activate your account again.',
        },
        {
          status: 401,
        }
      );
    }

    const authUid =
      decodedToken.uid;

    const tokenPhone =
      decodedToken.phone_number;

    if (
      !authUid ||
      typeof tokenPhone !== 'string'
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            'The verified cellphone number could not be confirmed.',
        },
        {
          status: 401,
        }
      );
    }

    const cellphoneNormalized =
      normalizePhone(tokenPhone);      

    if (
      !/^27\d{9}$/.test(
        cellphoneNormalized
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            'The verified cellphone number is invalid.',
        },
        {
          status: 400,
        }
      );
    }

    // =================================================
    // FIND EMPLOYEE PORTAL RECORD
    //
    // The Firebase-authenticated phone number must
    // match the employeePortal record.
    // =================================================

    // TEMP DIAGNOSTIC:
    // Confirm which employeePortal records the Admin SDK
    // can actually see in the selected Firestore database.
     
    const portalQuery =
      await adminDb
        .collection('employeePortalAccess')

        .where(
          'cellphoneNormalized',
          '==',
          cellphoneNormalized
        )
        .limit(2)
        .get();

    if (portalQuery.empty) {
      return NextResponse.json(
        {
          success: false,
          message:
            'No employee account matches this verified cellphone number.',
        },
        {
          status: 404,
        }
      );
    }

    // Duplicate phone numbers should never silently
    // activate an arbitrary employee.
    if (
      portalQuery.docs.length !== 1
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            'This cellphone number is linked to more than one employee record. Please contact your administrator.',
        },
        {
          status: 409,
        }
      );
    }

    const portalDoc =
      portalQuery.docs[0];

    const portalData =
      portalDoc.data();

    const suppliedHash =
      hashProof(rawProof);

    const now = Timestamp.now();

    // =================================================
    // EXISTING ACTIVATION CHECKS
    // =================================================

    if (
      portalData.portalActivated ===
      true
    ) {
      return NextResponse.json(
        {
          success: false,
          code:
            'ALREADY_ACTIVATED',
          message:
            'This Employee Portal account has already been activated.',
        },
        {
          status: 409,
        }
      );
    }

    if (
      portalData.authUid &&
      portalData.authUid !==
        authUid
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            'This employee account is already linked to another authentication identity.',
        },
        {
          status: 409,
        }
      );
    }

    // =================================================
    // HASH PIN
    //
    // NEVER store the original PIN.
    // bcrypt automatically generates a unique salt.
    // =================================================

    const pinHash =
      await bcrypt.hash(
        pin,
        PIN_ROUNDS
      );

    // =================================================
    // TRANSACTION
    //
    // Re-read the record immediately before activation
    // so two concurrent requests cannot activate/link
    // the account independently.
    // =================================================

    await adminDb.runTransaction(
      async (transaction) => {

        const currentSnapshot =
          await transaction.get(
            portalDoc.ref
          );

        if (
          !currentSnapshot.exists
        ) {
          throw new Error(
            'EMPLOYEE_PORTAL_NOT_FOUND'
          );
        }

        const current =
          currentSnapshot.data();

        if (
          current?.portalActivated ===
          true
        ) {
          throw new Error(
            'ALREADY_ACTIVATED'
          );
        }

        if (
          current?.authUid &&
          current.authUid !==
            authUid
        ) {
          throw new Error(
            'AUTH_UID_CONFLICT'
          );
        }

        const storedHash =
          typeof current?.activationProofHash ===
            'string'
            ? current.activationProofHash
            : '';

        const expiresAt =
          current?.activationProofExpiresAt;

        if (
          !storedHash ||
          !(expiresAt instanceof Timestamp) ||
          expiresAt.toMillis() <= now.toMillis() ||
          !safeEqualHex(
            storedHash,
            suppliedHash
          )
        ) {
          throw new Error(
            'ACTIVATION_PROOF_INVALID'
          );
        }

        transaction.update(
          portalDoc.ref,
          {
            authUid,
            pinHash,

            portalActivated:
              true,

            activatedAt:
              FieldValue.serverTimestamp(),

            activationProofHash:
              FieldValue.delete(),

            activationProofExpiresAt:
              FieldValue.delete(),

            activationProofIssuedAt:
              FieldValue.delete(),

            updatedAt:
              FieldValue.serverTimestamp(),
          }
        );
      }
    );

    // =================================================
    // SUCCESS
    // =================================================

    const response =
      NextResponse.json(
        {
          success: true,
          message:
            'Employee Portal account activated successfully.',
        },
        {
          status: 200,
        }
      );

    response.cookies.set(
      PROOF_COOKIE,
      '',
      {
        httpOnly: true,
        secure:
          process.env.NODE_ENV ===
          'production',
        sameSite: 'lax',
        path: '/api/staff/activation',
        maxAge: 0,
      }
    );

    return response;

  } catch (error: unknown) {

    // =================================================
    // KNOWN TRANSACTION ERRORS
    // =================================================

    const message =
      error instanceof Error
        ? error.message
        : '';

    if (
      message ===
      'ALREADY_ACTIVATED'
    ) {
      return NextResponse.json(
        {
          success: false,
          code:
            'ALREADY_ACTIVATED',
          message:
            'This Employee Portal account has already been activated.',
        },
        {
          status: 409,
        }
      );
    }

    if (
      message ===
      'AUTH_UID_CONFLICT'
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            'This employee account is already linked to another authentication identity.',
        },
        {
          status: 409,
        }
      );
    }

    if (
      message ===
      'EMPLOYEE_PORTAL_NOT_FOUND'
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            'The employee account could not be found.',
        },
        {
          status: 404,
        }
      );
    }

    if (
      message ===
      'ACTIVATION_PROOF_INVALID'
    ) {
      return NextResponse.json(
        {
          success: false,
          code:
            'ACTIVATION_PROOF_INVALID',
          message:
            'Your activation verification is invalid or has expired. Please start activation again.',
        },
        {
          status: 401,
        }
      );
    }

    // Keep the actual server error out of the
    // response sent to the employee.

    console.error(
      'Employee activation completion failed:',
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          'Unable to complete Employee Portal activation. Please try again.',
      },
      {
        status: 500,
      }
    );
  }
}