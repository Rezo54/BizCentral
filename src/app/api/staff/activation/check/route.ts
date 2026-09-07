// src/app/api/staff/activation/check/route.ts

import { randomBytes, createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { cellphoneToLocal, createIdVerificationHash, normalizeCellphone, safeHashCompare } from '@/lib/employee-security';

const OTP_COOLDOWN_SECONDS = 60;
const OTP_WINDOW_MINUTES = 15;
const OTP_MAX_PER_WINDOW = 3;
const OTP_BLOCK_MINUTES = 30;
const OTP_MAX_PER_DAY = 10;
const ID_VERIFY_MAX_FAILURES = 5;
const ID_VERIFY_WINDOW_MINUTES = 15;
const ID_VERIFY_BLOCK_MINUTES = 30;
const ACTIVATION_PROOF_MINUTES = 10;
const ACTIVATION_PROOF_COOKIE = 'bizcentral_activation_proof';

function proofHash(value: string) { return createHash('sha256').update(value).digest('hex'); }
function verificationFailed() { return NextResponse.json({ success:false, code:'VERIFICATION_FAILED', message:'We could not verify your employee details. Please check the information entered or contact your administrator.' }, {status:400}); }
function verificationBlocked() { return NextResponse.json({ success:false, code:'VERIFICATION_BLOCKED', message:'Too many verification attempts. Please try again later.' }, {status:429}); }

export async function POST(request: Request) {
  try {
    const adminDb = await getAdminDb();
    const body = await request.json();
    const cellphone = normalizeCellphone(String(body.cellphone || ''));
    const idLastSix = String(body.idLastSix || '').replace(/\D/g, '');
    if (!/^27\d{9}$/.test(cellphone) || !/^\d{6}$/.test(idLastSix)) return verificationFailed();

    const employeeQuery = await adminDb.collection('employees').where('cellphone','==',cellphoneToLocal(cellphone)).limit(2).get();
    if (employeeQuery.empty || employeeQuery.size !== 1) return verificationFailed();
    const employeeDoc = employeeQuery.docs[0];
    const employee = employeeDoc.data();
    const employeeId = employeeDoc.id;
    if (employee.status !== 'employed') return verificationFailed();

    const fullIdNumber = String(employee.idNumber || '').replace(/\D/g, '');
    if (fullIdNumber.length < 6) return verificationFailed();
    const expectedHash = createIdVerificationHash(employeeId, fullIdNumber.slice(-6));
    const enteredHash = createIdVerificationHash(employeeId, idLastSix);
    const idMatches = safeHashCompare(expectedHash, enteredHash);
    const portalRef = adminDb.collection('employeePortalAccess').doc(employeeId);
    const now = Timestamp.now();
    const rawProof = randomBytes(32).toString('hex');
    const hashedProof = proofHash(rawProof);
    const proofExpiresAt = Timestamp.fromMillis(now.toMillis() + ACTIVATION_PROOF_MINUTES * 60 * 1000);

    const result = await adminDb.runTransaction(async transaction => {
      const portalSnap = await transaction.get(portalRef);
      const portalData = portalSnap.exists ? portalSnap.data() : undefined;
      if (portalData?.portalActivated === true) return {allowed:false,code:'ALREADY_ACTIVATED',status:409,message:'Your Employee Portal account is already activated. Please login or use Forgot PIN.'};
      const idBlockedUntil = portalData?.idVerifyBlockedUntil;
      if (idBlockedUntil instanceof Timestamp && idBlockedUntil.toMillis() > now.toMillis()) return {allowed:false,code:'VERIFICATION_BLOCKED',status:429,message:'Too many verification attempts. Please try again later.'};
      let failureCount = Number(portalData?.idVerifyFailureCount || 0);
      let failureWindow = portalData?.idVerifyWindowStartedAt;
      if (!(failureWindow instanceof Timestamp) || now.toMillis()-failureWindow.toMillis() > ID_VERIFY_WINDOW_MINUTES*60000) { failureCount=0; failureWindow=now; }
      if (!idMatches) {
        const next = failureCount + 1; const block = next >= ID_VERIFY_MAX_FAILURES;
        transaction.set(portalRef,{employeeId,edoId:employee.edoId||null,cellphoneNormalized:cellphone,portalActivated:portalData?.portalActivated===true,idVerifyFailureCount:block?0:next,idVerifyWindowStartedAt:failureWindow,idVerifyBlockedUntil:block?Timestamp.fromMillis(now.toMillis()+ID_VERIFY_BLOCK_MINUTES*60000):null,lastIdVerifyFailedAt:now,updatedAt:FieldValue.serverTimestamp(),...(portalSnap.exists?{}:{createdAt:FieldValue.serverTimestamp()})},{merge:true});
        return {allowed:false,code:block?'VERIFICATION_BLOCKED':'VERIFICATION_FAILED',status:block?429:400,message:block?'Too many verification attempts. Please try again later.':'Verification failed.'};
      }
      const otpBlockedUntil = portalData?.otpBlockedUntil;
      if (otpBlockedUntil instanceof Timestamp && otpBlockedUntil.toMillis() > now.toMillis()) return {allowed:false,code:'OTP_BLOCKED',status:429,message:'Too many verification requests. Please try again later.'};
      const last = portalData?.lastOtpRequestedAt;
      if (last instanceof Timestamp && (now.toMillis()-last.toMillis())/1000 < OTP_COOLDOWN_SECONDS) return {allowed:false,code:'OTP_COOLDOWN',status:429,message:'Please wait before requesting another verification code.'};
      let count=Number(portalData?.otpRequestCount||0), window=portalData?.otpWindowStartedAt;
      if (!(window instanceof Timestamp) || now.toMillis()-window.toMillis()>OTP_WINDOW_MINUTES*60000) {count=0;window=now;}
      if (count>=OTP_MAX_PER_WINDOW) {transaction.set(portalRef,{otpBlockedUntil:Timestamp.fromMillis(now.toMillis()+OTP_BLOCK_MINUTES*60000),updatedAt:FieldValue.serverTimestamp()},{merge:true});return {allowed:false,code:'OTP_BLOCKED',status:429,message:'Too many verification requests. Please try again later.'};}
      let daily=Number(portalData?.otpDailyCount||0), dailyStart=portalData?.otpDailyStartedAt;
      if (!(dailyStart instanceof Timestamp)||now.toMillis()-dailyStart.toMillis()>86400000){daily=0;dailyStart=now;}
      if(daily>=OTP_MAX_PER_DAY)return {allowed:false,code:'OTP_DAILY_LIMIT',status:429,message:'The daily verification limit has been reached. Please try again later.'};
      transaction.set(portalRef,{employeeId,edoId:employee.edoId||null,cellphoneNormalized:cellphone,idVerificationHash:expectedHash,portalActivated:false,authUid:portalData?.authUid||null,idVerifyFailureCount:0,idVerifyWindowStartedAt:FieldValue.delete(),idVerifyBlockedUntil:FieldValue.delete(),otpRequestCount:count+1,otpWindowStartedAt:window,otpDailyCount:daily+1,otpDailyStartedAt:dailyStart,lastOtpRequestedAt:now,otpBlockedUntil:null,activationProofHash:hashedProof,activationProofExpiresAt:proofExpiresAt,activationProofIssuedAt:now,updatedAt:FieldValue.serverTimestamp(),...(portalSnap.exists?{}:{createdAt:FieldValue.serverTimestamp()})},{merge:true});
      return {allowed:true,code:'OTP_ALLOWED',status:200};
    });
    if(!result.allowed){if(result.code==='VERIFICATION_FAILED')return verificationFailed();if(result.code==='VERIFICATION_BLOCKED')return verificationBlocked();return NextResponse.json({success:false,code:result.code,message:result.message},{status:result.status});}
    const response=NextResponse.json({success:true,code:'OTP_ALLOWED',cellphone:`+${cellphone}`},{status:200});
    response.cookies.set(ACTIVATION_PROOF_COOKIE,rawProof,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/api/staff/activation',maxAge:ACTIVATION_PROOF_MINUTES*60});
    return response;
  } catch(error){console.error('Employee activation check failed:',error);return NextResponse.json({success:false,code:'SERVER_ERROR',message:'Unable to process activation at this time.'},{status:500});}
}
