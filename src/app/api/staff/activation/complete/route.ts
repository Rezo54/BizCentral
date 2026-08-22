// src/app/api/staff/activation/complete/route.ts

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  FieldValue,
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

// =====================================================
// HELPERS
// =====================================================

function normalizePhone(
  value: string
) {
  return value.replace(/\D/g, '');
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

    // =================================================
    // BASIC VALIDATION
    // =================================================

    if (!idToken) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Authentication verification is required.',
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

      console.log('ACTIVATION PHONE CHECK', {
        tokenPhone,
        cellphoneNormalized,
        });

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

    const portalDiagnostic =
        await adminDb
        .collection('employeePortalAccess')
        .limit(5)
        .get();

    console.log(
    'ACTIVATION DATABASE CHECK',
    {
        adminProjectId:
        process.env.FIREBASE_ADMIN_PROJECT_ID,

        publicProjectId:
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,

        adminClientEmail:
        process.env.FIREBASE_ADMIN_CLIENT_EMAIL,

        databaseId:
        adminDb.databaseId,

        portalCount:
        portalDiagnostic.size,
    }
    );

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

    console.log('ACTIVATION PORTAL QUERY', {
        cellphoneNormalized,
        matches: portalQuery.size,
        });

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

        transaction.update(
          portalDoc.ref,
          {
            authUid,
            pinHash,

            portalActivated:
              true,

            activatedAt:
              FieldValue.serverTimestamp(),

            updatedAt:
              FieldValue.serverTimestamp(),
          }
        );
      }
    );

    // =================================================
    // SUCCESS
    // =================================================

    return NextResponse.json(
      {
        success: true,
        message:
          'Employee Portal account activated successfully.',
      },
      {
        status: 200,
      }
    );

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