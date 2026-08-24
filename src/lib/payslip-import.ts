import { PDFDocument } from "pdf-lib";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/lib/firebase";

export type PayslipImportRow = {
  page: number;
  employeeCode: string;
  idNumber: string;
  employeeName: string;
  payDate: string;
  payPeriod: string;
  netPay: string;
  annualLeave: string;
  ownerType: "employee" | "edo" | "unknown";
  ownerId: string;
  matched: boolean;
};

function safePart(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "_");
}

function numericValue(value: string) {
  const cleaned = value.replace(/\s/g, "").replace(/,/g, "");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

export async function importReadyPayslips(args: {
  sourceFile: File;
  rows: PayslipImportRow[];
  companyId: string;
  companyName: string;
  uploadedBy: string;
}) {
  const { sourceFile, rows, companyId, companyName, uploadedBy } = args;
  const ready = rows.filter((row) => row.matched && row.ownerType === "employee" && row.ownerId && row.payPeriod);
  if (!ready.length) throw new Error("There are no Ready employee payslips to import.");

  const sourceBytes = new Uint8Array(await sourceFile.arrayBuffer());
  const sourcePdf = await PDFDocument.load(sourceBytes);
  const results: { employeeCode: string; payPeriod: string; path: string }[] = [];

  for (const row of ready) {
    const individualPdf = await PDFDocument.create();
    const [copiedPage] = await individualPdf.copyPages(sourcePdf, [row.page - 1]);
    individualPdf.addPage(copiedPage);
    const pdfBytes = await individualPdf.save();

    const fileName = `${safePart(row.employeeCode)}_${row.payPeriod}.pdf`;
    const storagePath = `payslips/${safePart(companyId)}/${safePart(row.ownerId)}/${row.payPeriod}/${fileName}`;
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, pdfBytes, { contentType: "application/pdf" });
    const downloadUrl = await getDownloadURL(storageRef);

    // Deterministic document id = employee + payroll month. Re-importing the
    // same month updates/replaces the record instead of creating duplicates.
    const payslipId = `${row.ownerId}_${row.payPeriod}`;
    await setDoc(doc(db, "payslips", payslipId), {
      employeeId: row.ownerId,
      employeeCode: row.employeeCode,
      employeeName: row.employeeName,
      idNumber: row.idNumber,
      companyId,
      companyName,
      ownerType: "employee",
      payPeriod: row.payPeriod,
      payDate: row.payDate,
      netPay: numericValue(row.netPay),
      sageAnnualLeaveBalance: numericValue(row.annualLeave),
      pdfStoragePath: storagePath,
      pdfUrl: downloadUrl,
      sourceFileName: sourceFile.name,
      sourcePage: row.page,
      uploadedBy,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    // Keep the latest Sage balance on the employee for the leave screen. The
    // original month-end balance remains preserved on the payslip record.
    if (row.annualLeave) {
      await setDoc(doc(db, "employees", row.ownerId), {
        sageAnnualLeaveBalance: numericValue(row.annualLeave),
        sageLeaveBalancePeriod: row.payPeriod,
        sageLeaveBalanceUpdatedAt: serverTimestamp(),
      }, { merge: true });
    }

    results.push({ employeeCode: row.employeeCode, payPeriod: row.payPeriod, path: storagePath });
  }

  return results;
}
