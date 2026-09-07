// src/app/api/staff/activation/complete/route.ts
import { createHash, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import bcrypt from 'bcryptjs';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
const PIN_ROUNDS=12;
const PROOF_COOKIE='bizcentral_activation_proof';
function normalizePhone(v:string){return v.replace(/\D/g,'');}
function hash(v:string){return createHash('sha256').update(v).digest('hex');}
function equal(a:string,b:string){try{const x=Buffer.from(a,'hex'),y=Buffer.from(b,'hex');return x.length===y.length&&timingSafeEqual(x,y);}catch{return false;}}
export async function POST(request:NextRequest){
 try{
  const body=await request.json(); const idToken=typeof body?.idToken==='string'?body.idToken.trim():''; const pin=typeof body?.pin==='string'?body.pin.trim():''; const rawProof=request.cookies.get(PROOF_COOKIE)?.value||'';
  if(!idToken||!rawProof)return NextResponse.json({success:false,message:'Your activation verification has expired. Please start activation again.'},{status:401});
  if(!/^\d{6}$/.test(pin))return NextResponse.json({success:false,message:'PIN must be exactly 6 digits.'},{status:400});
  const adminAuth=await getAdminAuth(); const adminDb=await getAdminDb(); let decoded;
  try{decoded=await adminAuth.verifyIdToken(idToken);}catch{return NextResponse.json({success:false,message:'Your verification session is invalid or has expired. Please activate your account again.'},{status:401});}
  const authUid=decoded.uid, tokenPhone=decoded.phone_number;
  if(!authUid||typeof tokenPhone!=='string')return NextResponse.json({success:false,message:'The verified cellphone number could not be confirmed.'},{status:401});
  const cellphoneNormalized=normalizePhone(tokenPhone); if(!/^27\d{9}$/.test(cellphoneNormalized))return NextResponse.json({success:false,message:'The verified cellphone number is invalid.'},{status:400});
  const portalQuery=await adminDb.collection('employeePortalAccess').where('cellphoneNormalized','==',cellphoneNormalized).limit(2).get();
  if(portalQuery.empty)return NextResponse.json({success:false,message:'No employee account matches this verified cellphone number.'},{status:404});
  if(portalQuery.docs.length!==1)return NextResponse.json({success:false,message:'This cellphone number is linked to more than one employee record. Please contact your administrator.'},{status:409});
  const portalDoc=portalQuery.docs[0]; const pinHash=await bcrypt.hash(pin,PIN_ROUNDS); const suppliedHash=hash(rawProof); const now=Timestamp.now();
  await adminDb.runTransaction(async transaction=>{
   const snap=await transaction.get(portalDoc.ref); if(!snap.exists)throw new Error('EMPLOYEE_PORTAL_NOT_FOUND'); const current=snap.data();
   if(current?.portalActivated===true)throw new Error('ALREADY_ACTIVATED'); if(current?.authUid&&current.authUid!==authUid)throw new Error('AUTH_UID_CONFLICT');
   const stored=typeof current?.activationProofHash==='string'?current.activationProofHash:''; const expires=current?.activationProofExpiresAt;
   if(!stored||!(expires instanceof Timestamp)||expires.toMillis()<=now.toMillis()||!equal(stored,suppliedHash))throw new Error('ACTIVATION_PROOF_INVALID');
   transaction.update(portalDoc.ref,{authUid,pinHash,portalActivated:true,activatedAt:FieldValue.serverTimestamp(),activationProofHash:FieldValue.delete(),activationProofExpiresAt:FieldValue.delete(),activationProofIssuedAt:FieldValue.delete(),updatedAt:FieldValue.serverTimestamp()});
  });
  const response=NextResponse.json({success:true,message:'Employee Portal account activated successfully.'},{status:200}); response.cookies.set(PROOF_COOKIE,'',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/api/staff/activation',maxAge:0}); return response;
 }catch(error:unknown){const message=error instanceof Error?error.message:''; if(message==='ALREADY_ACTIVATED')return NextResponse.json({success:false,code:'ALREADY_ACTIVATED',message:'This Employee Portal account has already been activated.'},{status:409}); if(message==='AUTH_UID_CONFLICT')return NextResponse.json({success:false,message:'This employee account is already linked to another authentication identity.'},{status:409}); if(message==='EMPLOYEE_PORTAL_NOT_FOUND')return NextResponse.json({success:false,message:'The employee account could not be found.'},{status:404}); if(message==='ACTIVATION_PROOF_INVALID')return NextResponse.json({success:false,code:'ACTIVATION_PROOF_INVALID',message:'Your activation verification is invalid or has expired. Please start activation again.'},{status:401}); console.error('Employee activation completion failed:',error); return NextResponse.json({success:false,message:'Unable to complete Employee Portal activation. Please try again.'},{status:500});}
}
