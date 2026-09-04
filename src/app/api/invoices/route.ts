import { FieldValue } from 'firebase-admin/firestore';
import {
  AuthorizationError,
  authorizationStatus,
  requireAuthContext,
} from '@/lib/server-authorization';

const RATES = {
  day: 470,
  second_delivery: 235,
  sunday_ph: 590,
} as const;

type ReliefType = keyof typeof RATES;

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function serializeValue(value: any): any {
  if (value && typeof value.toDate === 'function') return value.toDate().toISOString();
  return value;
}

function serializeInvoice(id: string, data: Record<string, any>) {
  return Object.fromEntries(
    Object.entries({ id, ...data }).map(([key, value]) => [key, serializeValue(value)])
  );
}

export async function GET(request: Request) {
  try {
    const context = await requireAuthContext(request);
    let query: FirebaseFirestore.Query = context.db.collection('invoices');

    if (context.userType === 'reliever') {
      // New invoices always carry the authenticated UID. Include legacy invoices
      // that predate canonical reliever company scope by matching either UID or
      // company identifier, then de-duplicate below.
      const byUid = await context.db.collection('invoices').where('relieverUserId', '==', context.uid).get();
      const docs = new Map(byUid.docs.map((doc) => [doc.id, doc]));
      if (context.companyId) {
        const byCompany = await context.db.collection('invoices').where('relieverCompanyId', '==', context.companyId).get();
        byCompany.docs.forEach((doc) => docs.set(doc.id, doc));
      }
      return Response.json({
        ok: true,
        invoices: Array.from(docs.values()).map((doc) => serializeInvoice(doc.id, doc.data())),
      });
    }

    if (context.userType === 'edo') {
      if (!context.companyId) throw new AuthorizationError('EDO company scope required', 403);
      query = query.where('edoId', '==', context.companyId);
    } else if (context.userType !== 'taskraft') {
      throw new AuthorizationError('Invoice access required', 403);
    }

    const snap = await query.get();
    return Response.json({
      ok: true,
      invoices: snap.docs.map((doc) => serializeInvoice(doc.id, doc.data())),
    });
  } catch (error) {
    const status = authorizationStatus(error);
    if (status) return Response.json({ ok: false, error: error instanceof Error ? error.message : 'Forbidden' }, { status });
    console.error('Invoice list failed:', error);
    return Response.json({ ok: false, error: 'Unable to load invoices' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireAuthContext(request);
    if (context.userType !== 'reliever') throw new AuthorizationError('Reliever access required', 403);

    const body = await request.json();
    const date = clean(body.date);
    const edoId = clean(body.edoId);
    const routeCode = clean(body.routeCode);
    const reliefType = clean(body.reliefType) as ReliefType;

    if (!date || !edoId || !routeCode || !(reliefType in RATES)) {
      return Response.json({ ok: false, error: 'Date, EDO, route and valid relief type are required' }, { status: 400 });
    }

    const today = new Date().toISOString().slice(0, 10);
    if (date > today) return Response.json({ ok: false, error: 'Future invoice dates are not allowed' }, { status: 400 });

    const routeSnap = await context.db.collection('routes')
      .where('edoId', '==', edoId)
      .where('routeNo', '==', routeCode)
      .limit(1)
      .get();
    if (routeSnap.empty) return Response.json({ ok: false, error: 'Selected route does not belong to the selected EDO' }, { status: 400 });

    const userSnap = await context.db.collection('users').doc(context.uid).get();
    const userData = userSnap.exists ? userSnap.data() ?? {} : {};
    const relieverName = clean(context.access.name) || clean(userData.name) || clean(userData.displayName) || clean(context.token.name) || clean(context.token.email) || 'Reliever';
    const relieverCompanyId = context.companyId || clean(userData.relieverId) || clean(userData.companyId) || context.uid;

    const edoUserSnap = await context.db.collection('users').where('companyId', '==', edoId).limit(1).get();
    const edoUser = edoUserSnap.empty ? {} : edoUserSnap.docs[0].data();
    const edoName = clean(edoUser.name) || edoId;
    const rate = RATES[reliefType];

    const invoice = {
      relieverUserId: context.uid,
      relieverBusinessName: relieverName,
      relieverCompanyId,
      edoId,
      edoName,
      date,
      routeCode,
      reliefType,
      rate,
      amount: rate,
      status: 'pending',
      submittedAt: FieldValue.serverTimestamp(),
      createdByUid: context.uid,
    };

    const ref = await context.db.collection('invoices').add(invoice);
    const created = await ref.get();
    return Response.json({ ok: true, invoice: serializeInvoice(ref.id, created.data() ?? invoice) }, { status: 201 });
  } catch (error) {
    const status = authorizationStatus(error);
    if (status) return Response.json({ ok: false, error: error instanceof Error ? error.message : 'Forbidden' }, { status });
    console.error('Invoice creation failed:', error);
    return Response.json({ ok: false, error: 'Unable to submit invoice' }, { status: 500 });
  }
}
