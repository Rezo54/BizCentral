// src/data/invoicing.ts

import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// ==============================
// TYPES
// ==============================

export type ReliefType = "day" | "second_delivery" | "sunday_ph";
export type InvoiceStatus = "pending" | "approved" | "rejected";

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

// ==============================
// RATE MATRIX
// ==============================

const RATE_MATRIX: Record<ReliefType, number> = {
  day: 470,
  second_delivery: 235,
  sunday_ph: 590,
};

export function getAllRates() {
  return { ...RATE_MATRIX };
}

export function setRate(type: ReliefType, value: number) {
  RATE_MATRIX[type] = value;
}

export function getRateFor(type: ReliefType): number {
  return RATE_MATRIX[type];
}

// ==============================
// CREATE (FIREBASE)
// ==============================

export async function createRelieverInvoice(input: {
  relieverUserId: string;
  relieverBusinessName: string;
  relieverCompanyId: string;
  edoId: string;
  edoName: string;

  // Firebase identification
  createdByUid?: string;
  edoUid?: string;

  date: string;
  routeCode: string;
  reliefType: ReliefType;
}): Promise<RelieverInvoice> {
  const rate = getRateFor(input.reliefType);

  const invoice = {
    ...input,
    rate,
    amount: rate,
    status: "pending" as InvoiceStatus,
    submittedAt: new Date().toISOString(),
  };

  const docRef = await addDoc(collection(db, "invoices"), invoice);

  return {
    id: docRef.id,
    ...invoice,
  };
}

// ==============================
// LISTING (FIREBASE)
// ==============================

export async function listAllRelieverInvoices(): Promise<RelieverInvoice[]> {
  const snapshot = await getDocs(collection(db, "invoices"));

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<RelieverInvoice, "id">),
  }));
}

export async function listInvoicesForRelieverCompany(
  companyId: string
): Promise<RelieverInvoice[]> {
  const q = query(
    collection(db, "invoices"),
    where("relieverCompanyId", "==", companyId)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<RelieverInvoice, "id">),
  }));
}

export async function listInvoicesForEdo(
  edoId: string
): Promise<RelieverInvoice[]> {
  const q = query(
    collection(db, "invoices"),
    where("edoId", "==", edoId)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<RelieverInvoice, "id">),
  }));
}

// Invoice approval/rejection is intentionally NOT implemented in this
// browser-side data module. All decision transitions must go through:
// PATCH /api/invoices/{invoiceId}/decision
// where canonical userAccess authorization, EDO ownership and pending-state
// checks are enforced server-side.
