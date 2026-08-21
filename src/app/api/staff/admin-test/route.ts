import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {

  try {

    // Dynamic import INSIDE the request.
    const {
      getAdminDb,
    } = await import(
      '@/lib/firebase-admin'
    );

    const db =
      await getAdminDb();

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

  } catch (error) {

    console.error(
      'Firebase Admin diagnostic failed:',
      error
    );

    return NextResponse.json(
      {
        success: false,
        code:
          'FIREBASE_ADMIN_TEST_FAILED',
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      {
        status: 500,
      }
    );
  }
}