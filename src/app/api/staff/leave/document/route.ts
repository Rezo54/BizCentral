import { NextRequest, NextResponse } from 'next/server';
import { getAdminStorage } from '@/lib/firebase-admin';
import { STAFF_SESSION_COOKIE, validateStaffSession } from '@/lib/staff-session';

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(['application/pdf','image/jpeg','image/png']);

function hasValidSignature(bytes: Buffer, type: string) {
  if (type === 'application/pdf') {
    return bytes.length >= 5 && bytes.subarray(0, 5).toString('ascii') === '%PDF-';
  }
  if (type === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (type === 'image/png') {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  }
  return false;
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(STAFF_SESSION_COOKIE)?.value ?? '';
    const session = await validateStaffSession(token);
    if (!session) return NextResponse.json({ success:false, message:'Unauthorised.' }, { status:401 });

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ success:false, message:'Select a supporting document.' }, { status:400 });
    if (!ALLOWED.has(file.type)) return NextResponse.json({ success:false, message:'Only PDF, JPG and PNG documents are allowed.' }, { status:400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ success:false, message:'Supporting documents may not exceed 8 MB.' }, { status:400 });

    const bytes = Buffer.from(await file.arrayBuffer());
    if (!hasValidSignature(bytes, file.type)) return NextResponse.json({ success:false, message:'The selected file does not match its declared document type.' }, { status:400 });

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const objectName = `leave-documents/${session.edoId}/${session.employeeId}/${Date.now()}-${safeName}`;
    const storage = await getAdminStorage();
    const bucket = storage.bucket();
    const object = bucket.file(objectName);
    await object.save(bytes, { resumable:false, contentType:file.type, metadata:{ cacheControl:'private, max-age=0, no-store' } });

    return NextResponse.json({ success:true, documentName:file.name, documentPath:objectName, documentType:file.type, documentSize:file.size });
  } catch (error) {
    console.error('Leave supporting document upload failed:', error);
    return NextResponse.json({ success:false, message:'Unable to upload supporting document.' }, { status:500 });
  }
}
