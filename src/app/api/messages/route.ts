import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';

function serialiseDate(value: any): string | null {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const decoded = await (await getAdminAuth()).verifyIdToken(idToken);
    const db = await getAdminDb();
    const accessSnap = await db.collection('userAccess').doc(decoded.uid).get();
    if (!accessSnap.exists) return NextResponse.json({ error: 'User access not found' }, { status: 403 });

    const access = accessSnap.data() || {};
    const userType = String(access.userType || '').toLowerCase();
    const companyId = String(access.companyId || access.edoId || '').trim();
    let docs: any[] = [];

    if (userType === 'edo') {
      if (!companyId) return NextResponse.json({ error: 'Your EDO company is not linked to this account.' }, { status: 403 });
      const [allSnap, selectedSnap] = await Promise.all([
        db.collection('adminMessages').where('targetType', '==', 'all').get(),
        db.collection('adminMessages').where('targetEdoIds', 'array-contains', companyId).get(),
      ]);
      const unique = new Map<string, any>();
      for (const doc of [...allSnap.docs, ...selectedSnap.docs]) unique.set(doc.id, doc);
      docs = [...unique.values()];
    } else if (userType === 'taskraft') {
      docs = (await db.collection('adminMessages').get()).docs;
    } else {
      return NextResponse.json({ error: 'Messages are not available for this account.' }, { status: 403 });
    }

    const today = new Date().toISOString().slice(0, 10);
    const messages = docs
      .map((doc: any) => {
        const data = doc.data() || {};
        return {
          id: doc.id,
          title: String(data.title || ''),
          message: String(data.message || ''),
          targetType: String(data.targetType || ''),
          targetEdoIds: Array.isArray(data.targetEdoIds) ? data.targetEdoIds.map(String) : [],
          createdByName: String(data.createdByName || 'Taskraft Admin'),
          createdAt: serialiseDate(data.createdAt),
          expiresOn: data.expiresOn ? String(data.expiresOn) : null,
          active: data.active !== false,
        };
      })
      .filter((message: any) => message.active && (!message.expiresOn || message.expiresOn >= today))
      .sort((a: any, b: any) => Date.parse(b.createdAt || '1970-01-01') - Date.parse(a.createdAt || '1970-01-01'));

    return NextResponse.json({ ok: true, messages });
  } catch (error) {
    console.error('Messages API failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load messages.' },
      { status: 500 },
    );
  }
}
