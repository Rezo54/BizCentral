import { NextRequest, NextResponse } from 'next/server';
import { getAdminStorage } from '@/lib/firebase-admin';
import { STAFF_SESSION_COOKIE, validateStaffSession } from '@/lib/staff-session';

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(['application/pdf','image/jpeg','image/png']);

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

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const objectName = `leave-documents/${session.edoId}/${session.employeeId}/${Date.now()}-${safeName}`;
    const storage = await getAdminStorage();
    const bucket = storage.bucket();
    const object = bucket.file(objectName);
    const bytes = Buffer.from(await file.arrayBuffer());
    await object.save(bytes, { resumable:false, contentType:file.type, metadata:{ cacheControl:'private, max-age=0, no-store' } });

    return NextResponse.json({ success:true, documentName:file.name, documentPath:objectName, documentType:file.type, documentSize:file.size });
  } catch (error) {
    console.error('Leave supporting document upload failed:', error);
    return NextResponse.json({ success:false, message:'Unable to upload supporting document.' }, { status:500 });
  }
}
