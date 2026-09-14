import {
  AuthorizationError,
  authorizationStatus,
  requireAuthContext,
} from '@/lib/server-authorization';

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  try {
    const context = await requireAuthContext(request);
    if (context.userType !== 'reliever') {
      throw new AuthorizationError('Reliever access required', 403);
    }

    const { invoiceId } = await params;
    const id = clean(invoiceId);
    if (!id) {
      return Response.json({ ok: false, error: 'Invoice ID is required' }, { status: 400 });
    }

    const invoiceRef = context.db.collection('invoices').doc(id);
    await context.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(invoiceRef);
      if (!snap.exists) throw new Error('INVOICE_NOT_FOUND');

      const invoice = snap.data() ?? {};
      const ownsInvoice =
        clean(invoice.relieverUserId) === context.uid ||
        (!!context.companyId && clean(invoice.relieverCompanyId) === context.companyId);

      if (!ownsInvoice) {
        throw new AuthorizationError('Invoice belongs to another reliever', 403);
      }
      if (clean(invoice.status).toLowerCase() !== 'pending') {
        throw new Error('INVALID_INVOICE_STATE');
      }

      transaction.delete(invoiceRef);
    });

    return Response.json({ ok: true, invoiceId: id });
  } catch (error) {
    const status = authorizationStatus(error);
    if (status) {
      return Response.json(
        { ok: false, error: error instanceof Error ? error.message : 'Forbidden' },
        { status }
      );
    }
    if (error instanceof Error && error.message === 'INVOICE_NOT_FOUND') {
      return Response.json({ ok: false, error: 'Invoice not found' }, { status: 404 });
    }
    if (error instanceof Error && error.message === 'INVALID_INVOICE_STATE') {
      return Response.json({ ok: false, error: 'Only pending invoices can be deleted' }, { status: 409 });
    }
    console.error('Invoice deletion failed:', error);
    return Response.json({ ok: false, error: 'Unable to delete invoice' }, { status: 500 });
  }
}
