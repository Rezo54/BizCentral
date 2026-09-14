const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function pass(condition, message) {
  if (!condition) throw new Error(`FAIL ${message}`);
  console.log(`PASS ${message}`);
}

const dashboard = read('src/app/(app)/dashboard/page.tsx');
const approval = read('src/app/(app)/invoicing/reliever/approve/page.tsx');
const reliever = read('src/app/(app)/invoicing/reliever/page.tsx');
const summary = read('src/app/(app)/invoicing/reliever/summary/page.tsx');
const data = read('src/data/invoicing.ts');
const deletion = read('src/app/api/invoices/[invoiceId]/route.ts');

pass(!dashboard.includes("collection(db,'invoices')"), 'dashboard has no direct invoice collection read');
pass(dashboard.includes('listAllRelieverInvoices()'), 'dashboard uses the scoped invoice API client');
pass(dashboard.includes("user?.userType==='reliever'?'/invoicing/reliever':'/invoicing/reliever/approve'"), 'dashboard routes relievers to their invoice page');
pass(!approval.includes('getDocs(collection(db, "invoices"))'), 'approval page has no direct invoice collection read');
pass(approval.includes('listAllRelieverInvoices()'), 'approval page uses the scoped invoice API client');
pass(!reliever.includes('deleteDoc('), 'reliever page has no direct invoice delete');
pass(reliever.includes('deletePendingRelieverInvoice(id)'), 'reliever page uses the protected delete API');
pass(summary.includes('user?.userType === "reliever"'), 'summary back link is role-aware');
pass(summary.includes('? "/invoicing/reliever"'), 'summary returns relievers to their invoice page');
pass(data.includes("invoiceApi('DELETE'"), 'invoice client sends deletion through the API');
pass(deletion.includes("context.userType !== 'reliever'"), 'delete API requires a reliever identity');
pass(deletion.includes("clean(invoice.relieverUserId) === context.uid"), 'delete API checks canonical user ownership');
pass(deletion.includes("clean(invoice.relieverCompanyId) === context.companyId"), 'delete API supports canonical legacy company ownership');
pass(deletion.includes("clean(invoice.status).toLowerCase() !== 'pending'"), 'delete API restricts deletion to pending invoices');
pass(deletion.includes('transaction.delete(invoiceRef)'), 'delete executes inside the validated transaction');

console.log('Invoice API migration static check PASS.');
