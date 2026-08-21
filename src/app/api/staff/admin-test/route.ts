import { NextResponse } from 'next/server';

import {
  getAdminDb,
} from '@/lib/firebase-admin';

export const runtime = 'nodejs';

export async function GET() {

  try {

    const db =
      getAdminDb();

    const snapshot =
      await db
        .collection('employees')
        .limit(1)
        .get();

    return NextResponse.json({
      success: true,
      message:
        'Firebase Admin connected successfully.',
      database:
        'biz-central',
      employeeFound:
        !snapshot.empty,
    });

  } catch (error: any) {

    console.error(
      'Firebase Admin test failed:',
      error
    );

    return NextResponse.json(
      {
        success: false,
        code:
          'FIREBASE_ADMIN_TEST_FAILED',

        // Safe diagnostic only.
        // No credentials are returned.
        error:
          error instanceof Error
            ? error.message
            : 'Unknown Firebase Admin error',
      },
      {
        status: 500,
      }
    );
  }
}