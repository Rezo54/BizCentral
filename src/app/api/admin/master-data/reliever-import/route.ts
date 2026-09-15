import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import {
  authorizationStatus,
  requireAdmin,
  requireAuthContext,
} from '@/lib/server-authorization';

type RelieverRow = {
  site?: unknown;
  name?: unknown;
  businessName?: unknown;
  cellphone?: unknown;
};

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function createRelieverId(name: string, phone: string): string {
  const cleanPhone = phone.replace(/\D/g, '');
  const cleanName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return `rel-${cleanName}-${cleanPhone}`;
}

export async function POST(request: Request) {
  try {
    const context = requireAdmin(await requireAuthContext(request));
    const body = await request.json().catch(() => ({}));
    const rows = Array.isArray(body?.rows) ? (body.rows as RelieverRow[]) : [];

    if (!rows.length || rows.length > 5000) {
      return NextResponse.json({ success: false, message: 'A valid Reliever import is required.' }, { status: 400 });
    }

    const relievers = new Map<string, Record<string, unknown>>();
    let skipped = 0;

    for (const row of rows) {
      const name = text(row.name);
      const cellphone = text(row.cellphone).replace(/\D/g, '');
      if (!name || !cellphone) {
        skipped++;
        continue;
      }

      const id = createRelieverId(name, cellphone);
      relievers.set(id, {
        id,
        relieverId: id,
        name,
        cellphone,
        businessName: text(row.businessName),
        site: text(row.site),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: context.uid,
      });
    }

    if (!relievers.size) {
      return NextResponse.json({ success: false, message: 'No valid Reliever rows were found.' }, { status: 400 });
    }

    const entries = [...relievers.entries()];
    for (let offset = 0; offset < entries.length; offset += 400) {
      const batch = context.db.batch();
      for (const [id, data] of entries.slice(offset, offset + 400)) {
        batch.set(context.db.collection('relievers').doc(id), data, { merge: true });
      }
      await batch.commit();
    }

    return NextResponse.json({ success: true, relievers: relievers.size, skipped });
  } catch (error) {
    const status = authorizationStatus(error);
    if (status) return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'Unauthorized' }, { status });
    console.error('Reliever master import failed:', error);
    return NextResponse.json({ success: false, message: 'Reliever import failed.' }, { status: 500 });
  }
}
