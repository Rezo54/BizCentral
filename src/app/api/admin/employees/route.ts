import { FieldValue } from 'firebase-admin/firestore';
import {
  authorizationStatus,
  requireAuthContext,
  requireAdmin,
} from '@/lib/server-authorization';

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function employeeIdFor(edoId: string, employeeCode: string): string {
  const cleanCode = employeeCode
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `${edoId}-${cleanCode}`;
}

export async function POST(request: Request) {
  try {
    const context = requireAdmin(await requireAuthContext(request));
    const body = await request.json();

    const edoId = clean(body.edoId);
    const employeeCode = clean(body.employeeCode);
    const firstName = clean(body.firstName);
    const surname = clean(body.surname);
    const occupation = clean(body.occupation);
    const workWeek = clean(body.workWeek);
    const idNumber = clean(body.idNumber);
    const cellphone = clean(body.cellphone);
    const dateOfBirth = clean(body.dateOfBirth);
    const appointmentDate = clean(body.appointmentDate);
    const status = clean(body.status || 'employed').toLowerCase();

    if (!edoId || !employeeCode || !firstName || !surname || !occupation || !workWeek || !appointmentDate) {
      return Response.json({ ok: false, error: 'Required employee fields are missing' }, { status: 400 });
    }
    if (!['5_day', '6_day'].includes(workWeek)) {
      return Response.json({ ok: false, error: 'Invalid work week' }, { status: 400 });
    }
    if (!['employed', 'terminated'].includes(status)) {
      return Response.json({ ok: false, error: 'Invalid employee status' }, { status: 400 });
    }
    if (idNumber && !/^\d{13}$/.test(idNumber)) {
      return Response.json({ ok: false, error: 'ID Number must contain 13 digits' }, { status: 400 });
    }

    const companyRef = context.db.collection('companies').doc(edoId);
    const companySnap = await companyRef.get();
    if (!companySnap.exists) {
      return Response.json({ ok: false, error: 'EDO business not found' }, { status: 400 });
    }
    const company = companySnap.data() ?? {};
    if (clean(company.type).toLowerCase() !== 'edo') {
      return Response.json({ ok: false, error: 'Selected company is not an EDO business' }, { status: 400 });
    }

    const employeeId = employeeIdFor(edoId, employeeCode);
    const employeeRef = context.db.collection('employees').doc(employeeId);

    await context.db.runTransaction(async (transaction) => {
      const existing = await transaction.get(employeeRef);
      if (existing.exists) throw new Error('DUPLICATE_EMPLOYEE');

      transaction.create(employeeRef, {
        id: employeeId,
        employeeCode,
        firstName,
        surname,
        edoId,
        edoName: clean(company.name),
        site: clean(company.site),
        occupation,
        workWeek,
        idNumber,
        cellphone,
        dateOfBirth,
        appointmentDate,
        status,
        terminationDate: null,
        terminationReason: null,
        source: 'manual',
        lastUpdatedSource: 'manual',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdByUid: context.uid,
      });
    });

    return Response.json({ ok: true, employeeId });
  } catch (error) {
    const authStatus = authorizationStatus(error);
    if (authStatus) return Response.json({ ok: false, error: error instanceof Error ? error.message : 'Forbidden' }, { status: authStatus });
    if (error instanceof Error && error.message === 'DUPLICATE_EMPLOYEE') {
      return Response.json({ ok: false, error: 'Employee Code already exists for this EDO business' }, { status: 409 });
    }
    console.error('Employee creation failed:', error);
    return Response.json({ ok: false, error: 'Employee could not be added' }, { status: 500 });
  }
}
