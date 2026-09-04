// src/data/invoicing.ts

import { auth } from '@/lib/firebase';

export type ReliefType = 'day' | 'second_delivery' | 'sunday_ph';
export type InvoiceStatus = 'pending' | 'approved' | 'rejected';

export type RelieverInvoice = {
  id: string;
  relieverUserId: string;
  relieverBusinessName: string;
  relieverCompanyId: string;
  edoId: string;
  edoName: string;
  date: string;
  routeCode: string;
  reliefType: ReliefType;
  rate: number;
  amount: number;
  status: InvoiceStatus;
  submittedAt: string;
  approvedAt?: string;
  approvedBy?: string;
  rejectedAt?: string;
  rejectedBy?: string;
};

const RATE_MATRIX: Record<ReliefType, number> = {
  day: 470,
  second_delivery: 235,
  sunday_ph: 590,
};

export function getAllRates() { return { ...RATE_MATRIX }; }
export function setRate(type: ReliefType, value: number) { RATE_MATRIX[type] = value; }
export function getRateFor(type: ReliefType): number { return RATE_MATRIX[type]; }

async function invoiceApi(method: 'GET' | 'POST', body?: unknown) {
  const firebaseUser = auth.currentUser;
  if (!firebaseUser) throw new Error('Your authenticated session is not available.');
  const token = await firebaseUser.getIdToken();
  const response = await fetch('/api/invoices', {
    method,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Invoice request failed');
  return payload;
}

export async function createRelieverInvoice(input: {
  edoId: string;
  date: string;
  routeCode: string;
  reliefType: ReliefType;
  // Legacy caller fields remain optional during migration but are deliberately
  // ignored by the server. Identity, names, rate, amount and status are trusted
  // only when resolved server-side.
  relieverUserId?: string;
  relieverBusinessName?: string;
  relieverCompanyId?: string;
  edoName?: string;
  createdByUid?: string;
  edoUid?: string;
}): Promise<RelieverInvoice> {
  const payload = await invoiceApi('POST', {
    edoId: input.edoId,
    date: input.date,
    routeCode: input.routeCode,
    reliefType: input.reliefType,
  });
  return payload.invoice as RelieverInvoice;
}

export async function listAllRelieverInvoices(): Promise<RelieverInvoice[]> {
  const payload = await invoiceApi('GET');
  return payload.invoices ?? [];
}

// Scope is enforced by the API from the authenticated canonical session. These
// compatibility functions intentionally ignore caller-supplied scope values.
export async function listInvoicesForRelieverCompany(_companyId?: string): Promise<RelieverInvoice[]> {
  const payload = await invoiceApi('GET');
  return payload.invoices ?? [];
}

export async function listInvoicesForEdo(_edoId?: string): Promise<RelieverInvoice[]> {
  const payload = await invoiceApi('GET');
  return payload.invoices ?? [];
}

// Invoice approval/rejection is intentionally NOT implemented in this browser
// data module. All decision transitions go through the protected decision API.
