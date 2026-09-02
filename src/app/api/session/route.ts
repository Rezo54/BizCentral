import { NextRequest, NextResponse } from 'next/server';
import {
  AuthorizationError,
  requireAuthContext,
} from '@/lib/server-authorization';

export const dynamic = 'force-dynamic';

/**
 * Security Migration Step 1B.
 *
 * Canonical current-user/session endpoint backed only by userAccess.
 * This endpoint is intentionally additive: no existing UI/session consumer
 * is switched to it in this step.
 */
export async function GET(request: NextRequest) {
  try {
    const context = await requireAuthContext(request);

    return NextResponse.json({
      ok: true,
      user: {
        uid: context.uid,
        status: 'approved',
        userType: context.userType,
        accessLevel: context.accessLevel,
        accountRole: context.accountRole || null,
        companyId: context.companyId || null,
        name: String(context.access.name ?? context.token.name ?? '').trim() || null,
        email: String(context.token.email ?? '').trim() || null,
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status },
      );
    }

    console.error('Canonical session read failed:', error);
    return NextResponse.json(
      { ok: false, error: 'Unable to load session' },
      { status: 500 },
    );
  }
}
