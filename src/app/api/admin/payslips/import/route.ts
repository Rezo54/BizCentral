import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb, getAdminStorage } from '@/lib/firebase-admin';

function safePart(value:string){ return value.replace(/[^A-Za-z0-9_-]/g, '_'); }
function numericValue(value:string){ const cleaned=value.replace(/\s/g,'').replace(/,/g,''); const n=Number(cleaned); return Number.isFinite(n)?n:null; }

export async function POST(request: NextRequest) {
  try {
    const authHeader=request.headers.get('authorization')||'';
    const token=authHeader.startsWith('Bearer ')?authHeader.slice(7):'';
    if(!token) return NextResponse.json({success:false,message:'Unauthorised.'},{status:401});

    const adminAuth=await getAdminAuth();
    const decoded=await adminAuth.verifyIdToken(token);
    const db=await getAdminDb();
    const accessSnap=await db.collection('userAccess').doc(decoded.uid).get();
    if(!accessSnap.exists) return NextResponse.json({success:false,message:'BizCentral access not found.'},{status:403});
    const access=accessSnap.data()||{};
    const status=String(access.status||'').toLowerCase();
    const userType=String(access.userType||'').toLowerCase();
    const accountRole=String(access.accountRole||'').toLowerCase();
    const accessLevel=String(access.accessLevel||'').toLowerCase();
    const superAdmin=accessLevel==='superadmin'||accessLevel==='super_admin';
    if(!(status==='approved'&&((userType==='taskraft'&&accountRole==='accountant')||superAdmin))) {
      return NextResponse.json({success:false,message:'Payslip Import is restricted to approved Taskraft accountant accounts.'},{status:403});
    }

    const form=await request.formData();
    const pdf=form.get('pdf');
    if(!(pdf instanceof File)||pdf.type!=='application/pdf') return NextResponse.json({success:false,message:'A PDF payslip is required.'},{status:400});
    if(pdf.size>10*1024*1024) return NextResponse.json({success:false,message:'Payslip PDF exceeds the 10 MB limit.'},{status:413});

    const employeeId=String(form.get('employeeId')||'');
    const employeeCode=String(form.get('employeeCode')||'');
    const employeeName=String(form.get('employeeName')||'');
    const idNumber=String(form.get('idNumber')||'');
    const companyId=String(form.get('companyId')||'');
    const companyName=String(form.get('companyName')||'');
    const ownerType=String(form.get('ownerType')||'employee');
    const payPeriod=String(form.get('payPeriod')||'');
    const payDate=String(form.get('payDate')||'');
    const netPay=String(form.get('netPay')||'');
    const annualLeave=String(form.get('annualLeave')||'');
    const sourceFileName=String(form.get('sourceFileName')||'');
    const sourcePage=Number(form.get('sourcePage')||0);
    if(!employeeId||!employeeCode||!companyId||!/^\d{4}-\d{2}$/.test(payPeriod)) return NextResponse.json({success:false,message:'Invalid payslip metadata.'},{status:400});

    const employeeSnap=await db.collection('employees').doc(employeeId).get();
    if(!employeeSnap.exists) return NextResponse.json({success:false,message:'Employee not found.'},{status:404});
    const employee=employeeSnap.data()||{};
    if(String(employee.edoId||'')!==companyId||String(employee.employeeCode||'').trim().toLowerCase()!==employeeCode.trim().toLowerCase()) {
      return NextResponse.json({success:false,message:'Employee does not match the selected EDO company.'},{status:400});
    }

    const fileName=`${safePart(employeeCode)}_${payPeriod}.pdf`;
    const storagePath=`payslips/${safePart(companyId)}/${safePart(employeeId)}/${payPeriod}/${fileName}`;
    const storage=await getAdminStorage();
    const file=storage.bucket().file(storagePath);
    await file.save(Buffer.from(await pdf.arrayBuffer()),{contentType:'application/pdf',resumable:false,metadata:{cacheControl:'private, max-age=0, no-store'}});

    const payslipId=`${employeeId}_${payPeriod}`;
    await db.collection('payslips').doc(payslipId).set({employeeId,employeeCode,employeeName,idNumber,companyId,companyName,ownerType,payPeriod,payDate,netPay:numericValue(netPay),sageAnnualLeaveBalance:numericValue(annualLeave),pdfStoragePath:storagePath,sourceFileName,sourcePage,uploadedBy:decoded.uid,updatedAt:new Date()},{merge:true});
    if(annualLeave) await db.collection('employees').doc(employeeId).set({sageAnnualLeaveBalance:numericValue(annualLeave),sageLeaveBalancePeriod:payPeriod,sageLeaveBalanceUpdatedAt:new Date()},{merge:true});

    return NextResponse.json({success:true,employeeCode,payPeriod,path:storagePath});
  } catch(error) {
    console.error('Payslip import failed:',error);
    return NextResponse.json({success:false,message:'Unable to import payslip.'},{status:500});
  }
}
