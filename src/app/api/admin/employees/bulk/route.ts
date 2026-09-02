import { FieldValue } from 'firebase-admin/firestore';
import {
  authorizationStatus,
  requireAdmin,
  requireAuthContext,
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

type ImportRow = {
  rowNumber?: number;
  edoId?: string;
  employeeCode?: string;
  firstName?: string;
  surname?: string;
  occupation?: string;
  workWeek?: string;
  idNumber?: string;
  cellphone?: string;
  dateOfBirth?: string;
  appointmentDate?: string;
  status?: string;
  terminationDate?: string;
  terminationReason?: string;
};

export async function POST(request: Request) {
  try {
    const context = requireAdmin(await requireAuthContext(request));
    const body = await request.json();
    const rows: ImportRow[] = Array.isArray(body.rows) ? body.rows : [];

    if (rows.length === 0) {
      return Response.json({ ok: false, error: 'No employee rows supplied' }, { status: 400 });
    }
    if (rows.length > 500) {
      return Response.json({ ok: false, error: 'Maximum 500 employees per upload' }, { status: 400 });
    }

    const companyIds = [...new Set(rows.map((row) => clean(row.edoId)).filter(Boolean))];
    const companyRefs = companyIds.map((id) => context.db.collection('companies').doc(id));
    const companySnaps = companyRefs.length ? await context.db.getAll(...companyRefs) : [];
    const companies = new Map<string, FirebaseFirestore.DocumentData>();
    companySnaps.forEach((snap) => {
      if (snap.exists) companies.set(snap.id, snap.data() ?? {});
    });

    const prepared = rows.map((row) => {
      const edoId = clean(row.edoId);
      const employeeCode = clean(row.employeeCode);
      const firstName = clean(row.firstName);
      const surname = clean(row.surname);
      const occupation = clean(row.occupation);
      const isEdo = occupation.toLowerCase() === 'edo';
      const workWeek = isEdo ? '' : clean(row.workWeek);
      const idNumber = clean(row.idNumber);
      const cellphone = clean(row.cellphone);
      const dateOfBirth = clean(row.dateOfBirth);
      const appointmentDate = clean(row.appointmentDate);
      const status = clean(row.status).toLowerCase();
      const terminationDate = clean(row.terminationDate);
      const terminationReason = clean(row.terminationReason);
      const errors: string[] = [];
      const company = companies.get(edoId);

      if (!edoId || !company || clean(company.type).toLowerCase() !== 'edo') errors.push('Invalid EDO business');
      if (!employeeCode) errors.push('Employee Code missing');
      if (!firstName) errors.push('First Name missing');
      if (!surname) errors.push('Surname missing');
      if (!occupation) errors.push('Occupation missing');
      if (!isEdo && !['5_day', '6_day'].includes(workWeek)) errors.push('Invalid Work Week');
      if (!appointmentDate) errors.push('Appointment Date missing');
      if (!['employed', 'terminated'].includes(status)) errors.push('Invalid status');
      if (idNumber && !/^\d{13}$/.test(idNumber)) errors.push('ID Number must contain 13 digits');

      return {
        rowNumber: Number(row.rowNumber ?? 0),
        employeeId: employeeIdFor(edoId, employeeCode),
        edoId,
        employeeCode,
        firstName,
        surname,
        occupation,
        workWeek,
        idNumber,
        cellphone,
        dateOfBirth,
        appointmentDate,
        status,
        terminationDate,
        terminationReason,
        company,
        errors,
      };
    });

    const duplicateKeys = new Set<string>();
    const seen = new Set<string>();
    prepared.forEach((row) => {
      const key = `${row.edoId}|${row.employeeCode.toLowerCase()}`;
      if (seen.has(key)) duplicateKeys.add(key);
      seen.add(key);
    });
    prepared.forEach((row) => {
      if (duplicateKeys.has(`${row.edoId}|${row.employeeCode.toLowerCase()}`)) row.errors.push('Duplicate Employee Code in upload');
    });

    const invalid = prepared.filter((row) => row.errors.length > 0);
    if (invalid.length > 0) {
      return Response.json({
        ok: false,
        error: 'Bulk upload contains invalid rows',
        rows: invalid.map((row) => ({ rowNumber: row.rowNumber, employeeCode: row.employeeCode, errors: row.errors })),
      }, { status: 400 });
    }

    const employeeRefs = prepared.map((row) => context.db.collection('employees').doc(row.employeeId));
    const existingSnaps = employeeRefs.length ? await context.db.getAll(...employeeRefs) : [];
    const existing = new Set(existingSnaps.filter((snap) => snap.exists).map((snap) => snap.id));

    // Preserve the legacy bulk-import behaviour: existing employee IDs are updated/merged,
    // while new IDs are created. The server, not the browser, now controls identity and company metadata.
    const batch = context.db.batch();
    prepared.forEach((row) => {
      const ref = context.db.collection('employees').doc(row.employeeId);
      batch.set(ref, {
        id: row.employeeId,
        employeeCode: row.employeeCode,
        firstName: row.firstName,
        surname: row.surname,
        edoId: row.edoId,
        edoName: clean(row.company?.name),
        site: clean(row.company?.site),
        occupation: row.occupation,
        workWeek: row.workWeek,
        idNumber: row.idNumber,
        cellphone: row.cellphone,
        dateOfBirth: row.dateOfBirth,
        appointmentDate: row.appointmentDate,
        status: row.status,
        terminationDate: row.terminationDate || null,
        terminationReason: row.terminationReason || null,
        source: existing.has(row.employeeId) ? 'bulk-update' : 'bulk-import',
        lastUpdatedSource: 'bulk',
        updatedAt: FieldValue.serverTimestamp(),
        updatedByUid: context.uid,
        ...(existing.has(row.employeeId) ? {} : { createdAt: FieldValue.serverTimestamp(), createdByUid: context.uid }),
      }, { merge: true });
    });
    await batch.commit();

    return Response.json({
      ok: true,
      processed: prepared.length,
      created: prepared.filter((row) => !existing.has(row.employeeId)).length,
      updated: prepared.filter((row) => existing.has(row.employeeId)).length,
    });
  } catch (error) {
    const authStatus = authorizationStatus(error);
    if (authStatus) {
      return Response.json({ ok: false, error: error instanceof Error ? error.message : 'Forbidden' }, { status: authStatus });
    }
    console.error('Employee bulk import failed:', error);
    return Response.json({ ok: false, error: 'Employee bulk upload failed' }, { status: 500 });
  }
}
