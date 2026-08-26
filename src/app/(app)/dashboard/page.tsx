'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getCurrentUser, SessionUser } from '@/lib/session';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileWarning, Users, CheckCircle, Activity, Loader2, ArrowRight } from 'lucide-react';

type Invoice = {
  id: string;
  edoId?: string;
  edoName?: string;
  amount?: number;
  status?: string;
};

function money(value: number) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2,
  }).format(value || 0);
}

export default function DashboardPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [invoiceLoading, setInvoiceLoading] = useState(true);
  const [invoiceError, setInvoiceError] = useState('');
  const [pendingInvoices, setPendingInvoices] = useState<Invoice[]>([]);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const current = await getCurrentUser();
        setUser(current);
        if (!current) return;

        setInvoiceLoading(true);
        setInvoiceError('');

        const invoicesRef = collection(db, 'invoices');
        let invoiceQuery;

        if (current.userType === 'edo') {
          const edoId = current.companyId || current.edoId || '';
          if (!edoId) {
            setInvoiceError('Your EDO company is not linked to this user account.');
            setPendingInvoices([]);
            return;
          }
          invoiceQuery = query(
            invoicesRef,
            where('edoId', '==', edoId),
            where('status', '==', 'pending')
          );
        } else if (current.userType === 'taskraft') {
          invoiceQuery = query(invoicesRef, where('status', '==', 'pending'));
        } else {
          setPendingInvoices([]);
          return;
        }

        const snap = await getDocs(invoiceQuery);
        setPendingInvoices(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Invoice, 'id'>) }))
        );
      } catch (e) {
        console.error('Dashboard invoice load failed:', e);
        setInvoiceError(e instanceof Error ? e.message : 'Unable to load pending invoices.');
      } finally {
        setInvoiceLoading(false);
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  const pendingTotal = useMemo(
    () => pendingInvoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0),
    [pendingInvoices]
  );

  if (loading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isEdo = user?.userType === 'edo';
  const invoiceLink = isEdo ? '/invoicing/reliever/approve' : '/invoicing/reliever/approve';

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          {isEdo
            ? 'Your current business actions and employee status.'
            : 'Current operational actions across BizCentral.'}
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="transition-shadow hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Invoices</CardTitle>
            <FileWarning className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            {invoiceLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : invoiceError ? (
              <p className="text-sm text-red-600">{invoiceError}</p>
            ) : (
              <>
                <div className="text-3xl font-bold">{pendingInvoices.length}</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {pendingInvoices.length === 0
                    ? 'No invoices awaiting approval'
                    : `${money(pendingTotal)} awaiting approval`}
                </p>
                <Button asChild variant="link" className="mt-3 h-auto p-0">
                  <Link href={invoiceLink}>
                    {pendingInvoices.length ? 'Review pending invoices' : 'Open invoicing'}
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Leave Requests</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-muted-foreground">—</div>
            <p className="mt-1 text-sm text-muted-foreground">Live leave status is next</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Employee Compliance</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-muted-foreground">—</div>
            <p className="mt-1 text-sm text-muted-foreground">Employee compliance is next</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Activity
          </CardTitle>
          <CardDescription>
            Leave activity, upcoming staff leave and administrator messages will appear here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Activity feed will be connected after the dashboard action cards.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
