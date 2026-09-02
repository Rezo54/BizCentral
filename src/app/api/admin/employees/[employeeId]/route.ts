import { FieldValue } from 'firebase-admin/firestore';
import {
  authorizationStatus,
  requireAdmin,
  requireAuthContext,
} from '@/lib/server-authorization';

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  try {
    const context = requireAdmin(await requireAuthContext(request));
    const { employeeId } = await params;
    const id = clean(employeeId);
    if (!id) return Response.json({ ok: false, error: 'Employee ID is required' }, { status: 400 });

    const employeeRef = context.db.collection('employees').doc(id);
    const employeeSnap = await employeeRef.get();
    if (!employeeSnap.exists) return Response.json({ ok: false, error: 'Employee could not be found' }, { status: 404 });

    const existing = employeeSnap.data() ?? {};
    const body = await request.json();
    const firstName = clean(body.firstName);
    const surname = clean(body.surname);
    const occupation = clean(body.occupation);
    const isEdo = occupation.toLowerCase() === 'edo';
    const workWeek = isEdo ? '' : clean(body.workWeek);
    const idNumber = clean(body.idNumber);
    const cellphone = clean(body.cellphone);
    const dateOfBirth = clean(body.dateOfBirth);
    const appointmentDate = clean(body.appointmentDate);
    const status = clean(body.status).toLowerCase();
    const terminationDate = clean(body.terminationDate);
    const terminationReason = clean(body.terminationReason);

    if (!firstName || !surname || !occupation || !appointmentDate) {
      return Response.json({ ok: false, error: 'Required employee fields are missing' }, { status: 400 });
    }
    if (!isEdo && !['5_day', '6_day'].includes(workWeek)) {
      return Response.json({ ok: false, error: 'Invalid work week' }, { status: 400 });
    }
    if (!['employed', 'terminated'].includes(status)) {
      return Response.json({ ok: false, error: 'Invalid employee status' }, { status: 400 });
    }
    if (idNumber && !/^\d{13}$/.test(idNumber)) {
      return Response.json({ ok: false, error: 'ID Number must contain 13 digits' }, { status: 400 });
    }
    if (status === 'terminated' && (!terminationDate || !terminationReason)) {
      return Response.json({ ok: false, error: 'Termination date and reason are required' }, { status: 400 });
    }

    // Identity/scope fields are deliberately preserved from the existing record.
    // The client cannot move an employee to another EDO or change the employee code through this endpoint.
    await employeeRef.update({
      firstName,
      surname,
      occupation,
      workWeek,
      idNumber,
      cellphone,
      dateOfBirth,
      appointmentDate,
      status,
      terminationDate: status === 'terminated' ? terminationDate : null,
      terminationReason: status === 'terminated' ? terminationReason : null,
      lastUpdatedSource: 'manual',
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: context.uid,
      // Preserve canonical identity explicitly for audit clarity if old records are sparse.
      id: clean(existing.id) || id,
      employeeCode: clean(existing.employeeCode),
      edoId: clean(existing.edoId),
      edoName: clean(existing.edoName),
      site: clean(existing.site),
    });

    return Response.json({ ok: true, employeeId: id });
  } catch (error) {
    const authStatus = authorizationStatus(error);
    if (authStatus) {
      return Response.json(
        { ok: false, error: error instanceof Error ? error.message : 'Forbidden' },
        { status: authStatus }
      );
    }
    console.error('Employee update failed:', error);
    return Response.json({ ok: false, error: 'Employee could not be updated' }, { status: 500 });
  }
}
