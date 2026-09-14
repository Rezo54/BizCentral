import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import {
  authorizationStatus,
  requireAdmin,
  requireAuthContext,
} from '@/lib/server-authorization';

function text(value: unknown): string {
  return String(value ?? '').trim();
}

export async function POST(request: Request) {
  try {
    const context = requireAdmin(await requireAuthContext(request));
    const [companiesSnap, relieversSnap] = await Promise.all([
      context.db.collection('companies').get(),
      context.db.collection('relievers').get(),
    ]);

    const writes = new Map<string, Record<string, unknown>>();
    let edoFound = 0;
    let relieversFound = 0;
    let skipped = 0;

    for (const companyDoc of companiesSnap.docs) {
      const company = companyDoc.data();
      if (text(company.type).toLowerCase() !== 'edo') continue;
      edoFound++;
      const name = text(company.name);
      if (!name) {
        skipped++;
        continue;
      }
      writes.set(companyDoc.id, {
        name,
        type: 'edo',
        active: true,
        sourceId: companyDoc.id,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: context.uid,
      });
    }

    for (const relieverDoc of relieversSnap.docs) {
      const reliever = relieverDoc.data();
      relieversFound++;
      const name = text(reliever.businessName || reliever.name);
      if (!name) {
        skipped++;
        continue;
      }
      writes.set(`reliever-${relieverDoc.id}`, {
        name,
        type: 'reliever',
        active: true,
        sourceId: relieverDoc.id,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: context.uid,
      });
    }

    const entries = [...writes.entries()];
    for (let offset = 0; offset < entries.length; offset += 400) {
      const batch = context.db.batch();
      for (const [id, data] of entries.slice(offset, offset + 400)) {
        batch.set(context.db.collection('signupCompanies').doc(id), data, { merge: true });
      }
      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      edoFound,
      edoSynced: entries.filter(([, value]) => value.type === 'edo').length,
      relieversFound,
      relieversSynced: entries.filter(([, value]) => value.type === 'reliever').length,
      totalSynced: entries.length,
      skipped,
      errors: [],
    });
  } catch (error) {
    const status = authorizationStatus(error);
    if (status) return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'Unauthorized' }, { status });
    console.error('Signup company sync failed:', error);
    return NextResponse.json({ success: false, message: 'Signup company sync failed.' }, { status: 500 });
  }
}
