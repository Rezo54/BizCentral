import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import bcrypt from 'bcryptjs';

import { getAdminDb } from '@/lib/firebase-admin';
import {
  createStaffSession,
  STAFF_SESSION_COOKIE,
} from '@/lib/staff-session';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (/^0\d{9}$/.test(digits)) return `27${digits.substring(1)}`;
  return digits;
}

function invalidCredentials() {
  return NextResponse.json(
    { success: false, message: 'Invalid cellphone number or PIN.' },
    { status: 401 }
  );
}

function suspendedAccount() {
  return NextResponse.json(
    {
      success: false,
      code: 'ACCOUNT_SUSPENDED',
      message:
        'Your Employee Portal account is currently suspended. Please contact your employer or administrator if you believe this is incorrect.',
    },
    { status: 403 }
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const cellphone = typeof body?.cellphone === 'string' ? body.cellphone.trim() : '';
    const pin = typeof body?.pin === 'string' ? body.pin.trim() : '';
    const cellphoneNormalized = normalizePhone(cellphone);

    if (!/^27\d{9}$/.test(cellphoneNormalized)) {
      return NextResponse.json(
        { success: false, message: 'Please enter a valid South African cellphone number.' },
        { status: 400 }
      );
    }

    if (!/^\d{6}$/.test(pin)) {
      return NextResponse.json(
        { success: false, message: 'PIN must be exactly 6 digits.' },
        { status: 400 }
      );
    }

    const adminDb = await getAdminDb();
    const portalQuery = await adminDb
      .collection('employeePortalAccess')
      .where('cellphoneNormalized', '==', cellphoneNormalized)
      .limit(2)
      .get();

    if (portalQuery.docs.length !== 1) return invalidCredentials();

    const portalDoc = portalQuery.docs[0];
    const portalData = portalDoc.data();

    if (portalData.portalActivated !== true) {
      return NextResponse.json(
        {
          success: false,
          code: 'NOT_ACTIVATED',
          message: 'This Employee Portal account has not been activated.',
        },
        { status: 403 }
      );
    }

    const pinHash = typeof portalData.pinHash === 'string' ? portalData.pinHash : '';
    const employeeId = typeof portalData.employeeId === 'string' ? portalData.employeeId : '';
    const edoId = typeof portalData.edoId === 'string' ? portalData.edoId : '';
    const authUid = typeof portalData.authUid === 'string' ? portalData.authUid : '';

    if (!pinHash || !employeeId || !edoId || !authUid) {
      console.error('Employee portal account is incomplete:', portalDoc.id);
      return NextResponse.json(
        { success: false, message: 'Unable to sign in. Please contact your administrator.' },
        { status: 500 }
      );
    }

    const loginBlockedUntil = portalData.loginBlockedUntil;
    if (
      loginBlockedUntil instanceof Timestamp &&
      loginBlockedUntil.toMillis() > Date.now()
    ) {
      const remainingMinutes = Math.max(
        1,
        Math.ceil((loginBlockedUntil.toMillis() - Date.now()) / 60000)
      );
      return NextResponse.json(
        {
          success: false,
          code: 'LOGIN_BLOCKED',
          message: `Too many incorrect attempts. Please try again in ${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'}.`,
        },
        { status: 429 }
      );
    }

    const pinValid = await bcrypt.compare(pin, pinHash);

    if (!pinValid) {
      await adminDb.runTransaction(async (transaction) => {
        const currentSnapshot = await transaction.get(portalDoc.ref);
        if (!currentSnapshot.exists) return;
        const current = currentSnapshot.data();
        const currentBlockedUntil = current?.loginBlockedUntil;
        if (
          currentBlockedUntil instanceof Timestamp &&
          currentBlockedUntil.toMillis() > Date.now()
        ) return;

        const currentAttempts =
          typeof current?.failedLoginAttempts === 'number'
            ? current.failedLoginAttempts
            : 0;
        const nextAttempts = currentAttempts + 1;

        if (nextAttempts >= MAX_FAILED_ATTEMPTS) {
          transaction.update(portalDoc.ref, {
            failedLoginAttempts: 0,
            loginBlockedUntil: Timestamp.fromMillis(
              Date.now() + LOCKOUT_MINUTES * 60 * 1000
            ),
            lastFailedLoginAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          return;
        }

        transaction.update(portalDoc.ref, {
          failedLoginAttempts: nextAttempts,
          lastFailedLoginAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      return invalidCredentials();
    }

    // Only disclose suspension after the employee has proved possession of
    // the correct PIN. This avoids turning employment state into an account
    // enumeration signal for unauthenticated callers.
    const employeeSnapshot = await adminDb
      .collection('employees')
      .doc(employeeId)
      .get();
    const employee = employeeSnapshot.exists ? employeeSnapshot.data() : undefined;

    if (!employee || employee.status !== 'employed' || employee.edoId !== edoId) {
      return suspendedAccount();
    }

    await portalDoc.ref.update({
      failedLoginAttempts: 0,
      loginBlockedUntil: FieldValue.delete(),
      lastLoginAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const session = await createStaffSession({
      employeeId,
      edoId,
      portalAccessId: portalDoc.id,
      authUid,
    });

    const response = NextResponse.json(
      { success: true, message: 'Signed in successfully.' },
      { status: 200 }
    );

    response.cookies.set(STAFF_SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: session.expiresAt.toDate(),
    });

    return response;
  } catch (error: unknown) {
    console.error('Employee login failed:', error);
    return NextResponse.json(
      { success: false, message: 'Unable to sign in. Please try again.' },
      { status: 500 }
    );
  }
}
