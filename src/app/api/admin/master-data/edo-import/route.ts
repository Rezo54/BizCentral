import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import {
  authorizationStatus,
  requireAdmin,
  requireAuthContext,
} from '@/lib/server-authorization';

type EdoRow = {
  site?: unknown;
  companyName?: unknown;
  edoBusinessName?: unknown;
  routeNo?: unknown;
  route?: unknown;
  routeDescription?: unknown;
  description?: unknown;
};

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function createCompanyId(name: string): string {
  return `edo-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`;
}

export async function POST(request: Request) {
  try {
    const context = requireAdmin(await requireAuthContext(request));
    const body = await request.json().catch(() => ({}));
    const rows = Array.isArray(body?.rows) ? (body.rows as EdoRow[]) : [];

    if (!rows.length || rows.length > 5000) {
      return NextResponse.json({ success: false, message: 'A valid EDO import is required.' }, { status: 400 });
    }

    const companies = new Map<string, { id: string; name: string; site: string }>();
    const routes = new Map<string, { id: string; edoId: string; routeNo: string; description: string }>();
    let skipped = 0;

    for (const row of rows) {
      const name = text(row.companyName || row.edoBusinessName);
      const routeNo = text(row.routeNo || row.route);
      if (!name || !routeNo) {
        skipped++;
        continue;
      }

      const companyId = createCompanyId(name);
      if (!companyId || companyId === 'edo-') {
        skipped++;
        continue;
      }

      companies.set(companyId, {
        id: companyId,
        name,
        site: text(row.site).toLowerCase(),
      });

      const routeId = `${companyId}_${routeNo}`;
      routes.set(routeId, {
        id: routeId,
        edoId: companyId,
        routeNo,
        description: text(row.routeDescription || row.description),
      });
    }

    if (!companies.size || !routes.size) {
      return NextResponse.json({ success: false, message: 'No valid EDO rows were found.' }, { status: 400 });
    }

    const writes: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }> = [];
    for (const company of companies.values()) {
      writes.push({
        ref: context.db.collection('companies').doc(company.id),
        data: { ...company, type: 'edo', updatedAt: FieldValue.serverTimestamp(), updatedBy: context.uid },
      });
    }
    for (const route of routes.values()) {
      writes.push({
        ref: context.db.collection('routes').doc(route.id),
        data: { ...route, updatedAt: FieldValue.serverTimestamp(), updatedBy: context.uid },
      });
    }

    for (let offset = 0; offset < writes.length; offset += 400) {
      const batch = context.db.batch();
      for (const write of writes.slice(offset, offset + 400)) batch.set(write.ref, write.data, { merge: true });
      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      companies: companies.size,
      routes: routes.size,
      skipped,
    });
  } catch (error) {
    const status = authorizationStatus(error);
    if (status) return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'Unauthorized' }, { status });
    console.error('EDO master import failed:', error);
    return NextResponse.json({ success: false, message: 'EDO import failed.' }, { status: 500 });
  }
}
