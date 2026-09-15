import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import {
  authorizationStatus,
  requireAdmin,
  requireAuthContext,
} from '@/lib/server-authorization';

type CompanyRow = {
  name?: unknown;
  type?: unknown;
};

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function createCompanyId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export async function POST(request: Request) {
  try {
    const context = requireAdmin(await requireAuthContext(request));
    const body = await request.json().catch(() => ({}));
    const rows = Array.isArray(body?.rows) ? (body.rows as CompanyRow[]) : [];

    if (!rows.length || rows.length > 5000) {
      return NextResponse.json({ success: false, message: 'A valid Company import is required.' }, { status: 400 });
    }

    const companies = new Map<string, Record<string, unknown>>();
    let skipped = 0;

    for (const row of rows) {
      const name = text(row.name);
      const type = text(row.type).toLowerCase();
      const id = createCompanyId(name);

      if (!name || !type || !id) {
        skipped++;
        continue;
      }

      companies.set(id, {
        name,
        type,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: context.uid,
      });
    }

    if (!companies.size) {
      return NextResponse.json({ success: false, message: 'No valid Company rows were found.' }, { status: 400 });
    }

    const entries = [...companies.entries()];
    for (let offset = 0; offset < entries.length; offset += 400) {
      const batch = context.db.batch();
      for (const [id, data] of entries.slice(offset, offset + 400)) {
        batch.set(context.db.collection('companies').doc(id), data, { merge: true });
      }
      await batch.commit();
    }

    return NextResponse.json({ success: true, companies: companies.size, skipped });
  } catch (error) {
    const status = authorizationStatus(error);
    if (status) return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'Unauthorized' }, { status });
    console.error('Company master import failed:', error);
    return NextResponse.json({ success: false, message: 'Company import failed.' }, { status: 500 });
  }
}
