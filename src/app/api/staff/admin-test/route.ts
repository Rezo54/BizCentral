import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// This endpoint previously exposed an unauthenticated Firebase Admin
// diagnostic and leaked internal error details. Keep the historical route
// closed instead of exposing privileged connectivity information publicly.
export async function GET() {
  return NextResponse.json(
    {
      success: false,
      message: 'Not found.',
    },
    {
      status: 404,
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  );
}
