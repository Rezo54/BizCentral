import { PDFDocument } from "pdf-lib";
import { getAuth } from "firebase/auth";

export type PayslipImportRow = { page:number; employeeCode:string; idNumber:string; employeeName:string; payDate:string; payPeriod:string; netPay:string; annualLeave:string; ownerType:"employee"|"edo"|"unknown"; ownerId:string; matched:boolean };

export async function importReadyPayslips(args:{sourceFile:File;rows:PayslipImportRow[];companyId:string;companyName:string;uploadedBy:string}){
  const{sourceFile,rows,companyId,companyName}=args;
  const ready=rows.filter(row=>row.matched&&(row.ownerType==="employee"||row.ownerType==="edo")&&row.ownerId&&row.payPeriod);
  if(!ready.length)throw new Error("There are no Ready payslips to import.");
  const user=getAuth().currentUser;
  if(!user)throw new Error("You must be signed in to import payslips.");
  const token=await user.getIdToken();
  const sourceBytes=new Uint8Array(await sourceFile.arrayBuffer()),sourcePdf=await PDFDocument.load(sourceBytes),results:{employeeCode:string;payPeriod:string;path:string}[]=[];
  for(const row of ready){
    const individualPdf=await PDFDocument.create();
    const[copiedPage]=await individualPdf.copyPages(sourcePdf,[row.page-1]);
    individualPdf.addPage(copiedPage);
    const pdfBytes=await individualPdf.save();
    const form=new FormData();
    form.set("pdf",new Blob([pdfBytes],{type:"application/pdf"}),`${row.employeeCode}_${row.payPeriod}.pdf`);
    form.set("employeeId",row.ownerId); form.set("employeeCode",row.employeeCode); form.set("employeeName",row.employeeName); form.set("idNumber",row.idNumber);
    form.set("companyId",companyId); form.set("companyName",companyName); form.set("ownerType",row.ownerType); form.set("payPeriod",row.payPeriod); form.set("payDate",row.payDate);
    form.set("netPay",row.netPay); form.set("annualLeave",row.annualLeave); form.set("sourceFileName",sourceFile.name); form.set("sourcePage",String(row.page));
    const response=await fetch("/api/admin/payslips/import",{method:"POST",headers:{Authorization:`Bearer ${token}`},body:form});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.success)throw new Error(data.message||`Could not import payslip for ${row.employeeCode}.`);
    results.push({employeeCode:row.employeeCode,payPeriod:row.payPeriod,path:data.path});
  }
  return results;
}
