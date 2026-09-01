'use client';

import Link from 'next/link';
import { ArrowLeft, AlertTriangle, Camera, PackageCheck, ShieldCheck, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const crate = {
  previousOutstanding: 620,
  allowance: 500,
  issuedToday: 180,
  returnedToday: 0,
  replacementCost: 45,
};

const dolly = {
  previousOutstanding: 6,
  issuedToday: 3,
  returnedToday: 0,
  replacementCost: 900,
};

const money = (v: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 }).format(v || 0);

export default function CrateControlPage() {
  const crateExcess = Math.max(0, crate.previousOutstanding - crate.allowance);
  const crateExposure = crateExcess * crate.replacementCost;
  const currentCrates = crate.previousOutstanding + crate.issuedToday - crate.returnedToday;
  const currentDollies = dolly.previousOutstanding + dolly.issuedToday - dolly.returnedToday;
  const utilisation = crate.allowance ? (crate.previousOutstanding / crate.allowance) * 100 : 0;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" className="-ml-3">
        <Link href="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" />Back to Dashboard</Link>
      </Button>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Crate & Dolly Control</h1>
          <p className="text-muted-foreground">Your Premier returnable packaging position and indicative financial risk.</p>
        </div>
        <div className="rounded-lg border bg-background px-4 py-2 text-sm">
          <span className="text-muted-foreground">Morning position:</span> <b>1 Sep 2026</b>
        </div>
      </div>

      {crateExcess > 0 ? (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="flex flex-col gap-4 pt-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-red-100 p-2 text-red-700"><AlertTriangle className="h-6 w-6" /></div>
              <div>
                <div className="text-sm font-semibold uppercase tracking-wide text-red-700">Over Crate Allowance</div>
                <div className="mt-1 text-3xl font-bold text-red-700">{crateExcess} crates over</div>
                <p className="mt-1 text-sm text-red-800">Previous outstanding {crate.previousOutstanding} minus allowance {crate.allowance}.</p>
              </div>
            </div>
            <div className="md:text-right">
              <div className="text-sm font-medium text-red-700">Potential Charge Exposure</div>
              <div className="text-4xl font-bold text-red-700">{money(crateExposure)}</div>
              <div className="mt-1 text-xs text-red-700">Indicative risk only — not an actual Premier charge.</div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-emerald-300 bg-emerald-50">
          <CardContent className="flex items-center gap-3 pt-6 text-emerald-800">
            <ShieldCheck className="h-7 w-7" />
            <div><div className="font-bold">Within crate allowance</div><div className="text-sm">Potential Charge Exposure: {money(0)}</div></div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Previous Outstanding</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{crate.previousOutstanding}</div><p className="text-sm text-muted-foreground">Used for allowance risk</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Issued This Morning</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold text-blue-700">+{crate.issuedToday}</div><p className="text-sm text-muted-foreground">Not included in exposure</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Returned Today</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold text-emerald-700">{crate.returnedToday}</div><p className="text-sm text-muted-foreground">Premier morning recon</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Current Outstanding</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{currentCrates}</div><p className="text-sm text-muted-foreground">Includes today's issues</p></CardContent></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
        <Card>
          <CardHeader><CardTitle>Crate Allowance Position</CardTitle><CardDescription>Exposure is calculated from previous outstanding only.</CardDescription></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border p-4"><div className="text-xs uppercase text-muted-foreground">Allowance</div><div className="mt-1 text-2xl font-bold">{crate.allowance}</div></div>
              <div className="rounded-xl border p-4"><div className="text-xs uppercase text-muted-foreground">Utilisation</div><div className="mt-1 text-2xl font-bold">{utilisation.toFixed(1)}%</div></div>
              <div className="rounded-xl border p-4"><div className="text-xs uppercase text-muted-foreground">Replacement Cost</div><div className="mt-1 text-2xl font-bold">{money(crate.replacementCost)}</div><div className="text-xs text-muted-foreground">Effective-dated rate</div></div>
            </div>
            <div>
              <div className="mb-2 flex justify-between text-sm"><span>Previous outstanding vs allowance</span><b>{crate.previousOutstanding} / {crate.allowance}</b></div>
              <div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-red-500" style={{ width: `${Math.min(100, utilisation)}%` }} /></div>
            </div>
            <div className="rounded-lg bg-muted/50 p-4 text-sm">
              <b>Exposure calculation:</b> ({crate.previousOutstanding} previous outstanding − {crate.allowance} allowance) × {money(crate.replacementCost)} = <b className="text-red-700">{money(crateExposure)}</b>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Dolly Position</CardTitle><CardDescription>Current Premier dolly movement.</CardDescription></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border p-4"><div className="text-xs text-muted-foreground">Previous Outstanding</div><div className="text-2xl font-bold">{dolly.previousOutstanding}</div></div>
              <div className="rounded-xl border p-4"><div className="text-xs text-muted-foreground">Issued Today</div><div className="text-2xl font-bold text-blue-700">+{dolly.issuedToday}</div></div>
              <div className="rounded-xl border p-4"><div className="text-xs text-muted-foreground">Returned Today</div><div className="text-2xl font-bold text-emerald-700">{dolly.returnedToday}</div></div>
              <div className="rounded-xl border p-4"><div className="text-xs text-muted-foreground">Current Outstanding</div><div className="text-2xl font-bold">{currentDollies}</div></div>
            </div>
            <div className="mt-4 text-xs text-muted-foreground">Replacement cost: {money(dolly.replacementCost)} • Effective-dated Admin rate</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-6"><Camera className="mb-3 h-6 w-6 text-blue-700"/><div className="font-semibold">Today's Crate Slip</div><p className="mt-1 text-sm text-muted-foreground">Driver photographs and submits the Premier crate slip as daily evidence.</p><Button className="mt-4" disabled>Submit Crate Slip</Button><div className="mt-2 text-xs text-muted-foreground">Driver submission coming in the next build.</div></CardContent></Card>
        <Card><CardContent className="pt-6"><PackageCheck className="mb-3 h-6 w-6 text-emerald-700"/><div className="font-semibold">Return Evidence</div><p className="mt-1 text-sm text-muted-foreground">Submitted slips will be stored by date, route and driver for reconciliation.</p><div className="mt-4 rounded-lg bg-muted/50 p-3 text-sm">No slip submitted today</div></CardContent></Card>
        <Card><CardContent className="pt-6"><TrendingDown className="mb-3 h-6 w-6 text-violet-700"/><div className="font-semibold">Recovery Progress</div><p className="mt-1 text-sm text-muted-foreground">Track how crate recovery reduces outstanding exposure over time.</p><div className="mt-4 text-2xl font-bold">—</div><div className="text-xs text-muted-foreground">Available once daily history is loaded</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent Reconciliation</CardTitle><CardDescription>Daily Premier position and evidence history.</CardDescription></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-sm">
              <thead><tr className="border-b bg-muted/40 text-left"><th className="p-3">Date</th><th className="text-right">Previous Outstanding</th><th className="text-right">Issued</th><th className="text-right">Returned</th><th className="text-right">Allowance</th><th className="text-right">Over Allowance</th><th className="text-right">Potential Exposure</th><th className="text-center">Slip</th></tr></thead>
              <tbody><tr className="border-b"><td className="p-3 font-medium">1 Sep 2026</td><td className="text-right">620</td><td className="text-right">180</td><td className="text-right">0</td><td className="text-right">500</td><td className="text-right font-semibold text-red-700">120</td><td className="text-right font-semibold text-red-700">{money(crateExposure)}</td><td className="text-center text-muted-foreground">Pending</td></tr></tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
