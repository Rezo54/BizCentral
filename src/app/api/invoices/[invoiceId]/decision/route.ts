import { FieldValue } from 'firebase-admin/firestore';
import {
  AuthorizationError,
  authorizationStatus,
  requireAuthContext,
} from '@/lib/server-authorization';

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  try {
    const context = await requireAuthContext(request);
    const { invoiceId } = await params;
    const id = clean(invoiceId);
    const body = await request.json();
    const decision = clean(body.decision).toLowerCase();

    if (!id) return Response.json({ ok: false, error: 'Invoice ID is required' }, { status: 400 });
    if (!['approve', 'reject'].includes(decision)) {
      return Response.json({ ok: false, error: 'Decision must be approve or reject' }, { status: 400 });
    }

    const isSuperAdmin = context.userType === 'taskraft' && ['superadmin', 'super_admin'].includes(context.accessLevel);
    const isEdo = context.userType === 'edo';
    if (!isSuperAdmin && !isEdo) throw new AuthorizationError('Invoice approval access required', 403);

    const invoiceRef = context.db.collection('invoices').doc(id);
    await context.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(invoiceRef);
      if (!snap.exists) throw new Error('INVOICE_NOT_FOUND');
      const invoice = snap.data() ?? {};

      if (isEdo && clean(invoice.edoId) !== clean(context.companyId)) {
        throw new AuthorizationError('Invoice belongs to another EDO', 403);
      }
      if (clean(invoice.status).toLowerCase() !== 'pending') {
        throw new Error('INVALID_INVOICE_STATE');
      }

      // Canonical display name comes from the trusted userAccess record. Never trust a client-supplied approver name.
      const actorName = clean(context.access.name) || clean(context.token.name) || clean(context.token.email) || context.uid;
      if (decision === 'approve') {
        transaction.update(invoiceRef, {
          status: 'approved',
          approvedAt: FieldValue.serverTimestamp(),
          approvedBy: actorName,
          approvedByUid: context.uid,
          rejectedAt: null,
          rejectedBy: null,
          rejectedByUid: null,
        });
      } else {
        transaction.update(invoiceRef, {
          status: 'rejected',
          rejectedAt: FieldValue.serverTimestamp(),
          rejectedBy: actorName,
          rejectedByUid: context.uid,
          approvedAt: null,
          approvedBy: null,
          approvedByUid: null,
        });
      }
    });

    return Response.json({ ok: true, invoiceId: id, status: decision === 'approve' ? 'approved' : 'rejected' });
  } catch (error) {
    const authStatus = authorizationStatus(error);
    if (authStatus) return Response.json({ ok: false, error: error instanceof Error ? error.message : 'Forbidden' }, { status: authStatus });
    if (error instanceof Error && error.message === 'INVOICE_NOT_FOUND') return Response.json({ ok: false, error: 'Invoice not found' }, { status: 404 });
    if (error instanceof Error && error.message === 'INVALID_INVOICE_STATE') return Response.json({ ok: false, error: 'Only pending invoices can be approved or rejected' }, { status: 409 });
    console.error('Invoice decision failed:', error);
    return Response.json({ ok: false, error: 'Invoice decision failed' }, { status: 500 });
  }
}
