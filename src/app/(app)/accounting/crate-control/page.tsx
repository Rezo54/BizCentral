'use client';
import Link from 'next/link';
import { jsPDF } from 'jspdf';
import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { ArrowLeft, AlertTriangle, Download, FileSpreadsheet, Loader2, Settings, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import CrateAdminRouteTable from '@/components/crate-admin-route-table';
import { db } from '@/lib/firebase';
import { getCurrentUser, SessionUser } from '@/lib/session';
type ReplacementRate = { id: string; crateCost: number; dollyCost: number; effectiveFrom: string };
type Recon = { id: string; routeNo: string; edoId?: string; site?: string; sourceName?: string; reconDate: string; crate: { allowance: number; previousOutstanding: number; issuedToday: number; returnedToday: number; currentOutstanding: number }; dolly: { previousOutstanding: number; issuedToday: number; returnedToday: number; currentOutstanding: number } };
const ALL = '__all__'; const money = (v: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 }).format(v || 0); const validDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00`).getTime()); const prettyDate = (v: string) => validDate(v) ? new Date(`${v}T00:00:00`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : v; const daysBefore = (v: string, n: number) => { if (!validDate(v)) return ''; const d = new Date(`${v}T00:00:00`); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }; const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`; const savedEdoName = (r: Recon) => { if (!r.edoId) return r.sourceName || '—'; let n = r.edoId.replace(/^edo-/i, '').replace(/-/g, ' ').replace(/\benterprise\b/gi, '').replace(/\bpty\s*ltd\b/gi, '').replace(/\s+/g, ' ').trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase()); return n ? `${n} (PTY) LTD` : r.sourceName || '—' };
export default function CrateControlPage() {
    const [user, setUser] = useState<SessionUser | null>(null), [rates, setRates] = useState<ReplacementRate[]>([]), [recons, setRecons] = useState<Recon[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [selectedRoute, setSelectedRoute] = useState(''), [fromDate, setFromDate] = useState(''), [toDate, setToDate] = useState('');
    useEffect(() => { (async () => { try { const u = await getCurrentUser(); setUser(u); const reconQuery = u?.userType === 'edo' && u.companyId ? query(collection(db, 'crateReconDaily'), where('edoId', '==', u.companyId), orderBy('reconDate', 'desc')) : query(collection(db, 'crateReconDaily'), orderBy('reconDate', 'desc')); const [rateSnap, reconSnap] = await Promise.all([getDocs(query(collection(db, 'crateReplacementRates'), orderBy('effectiveFrom', 'desc'))), getDocs(reconQuery)]); setRates(rateSnap.docs.map(d => ({ id: d.id, ...d.data() } as ReplacementRate))); const rr = reconSnap.docs.map(d => ({ id: d.id, ...d.data() } as Recon)).filter(r => validDate(r.reconDate)); setRecons(rr); if (rr.length) setSelectedRoute(u?.userType === 'taskraft' ? ALL : rr[0].routeNo) } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load crate reconciliation data.') } finally { setLoading(false) } })() }, []);
    const isAll = user?.userType === 'taskraft' && selectedRoute === ALL, routes = useMemo(() => [...new Set(recons.map(r => r.routeNo))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [recons]), latestDate = recons[0]?.reconDate || '', routeRecons = useMemo(() => recons.filter(r => selectedRoute === ALL || r.routeNo === selectedRoute).sort((a, b) => b.reconDate.localeCompare(a.reconDate)), [recons, selectedRoute]), current = selectedRoute === ALL ? null : routeRecons[0] || null;
    useEffect(() => { const d = isAll ? latestDate : current?.reconDate; if (d) { setToDate(d); setFromDate(daysBefore(d, 6)) } }, [selectedRoute, isAll, latestDate, current?.reconDate]); const history = useMemo(() => routeRecons.filter(r => (!fromDate || r.reconDate >= fromDate) && (!toDate || r.reconDate <= toDate)), [routeRecons, fromDate, toDate]); const rateFor = (d: string) => rates.find(r => r.effectiveFrom <= d) ?? null;
    const latestAll = useMemo(() => isAll ? recons.filter(r => r.reconDate === latestDate) : [], [isAll, recons, latestDate]), totals = useMemo(() => latestAll.reduce((a, r) => { const s = Math.max(0, r.crate.previousOutstanding - r.crate.allowance), rate = rateFor(r.reconDate); a.prev += r.crate.previousOutstanding; a.allow += r.crate.allowance; a.short += s; a.exposure += s * Number(rate?.crateCost ?? 0); a.current += r.crate.currentOutstanding; a.dollyPrev += r.dolly.previousOutstanding; a.dollyCurrent += r.dolly.currentOutstanding; return a }, { prev: 0, allow: 0, short: 0, exposure: 0, current: 0, dollyPrev: 0, dollyCurrent: 0 }), [latestAll, rates]);
    const rate = current ? rateFor(current.reconDate) : null, crate = current?.crate ?? { allowance: 0, previousOutstanding: 0, issuedToday: 0, returnedToday: 0, currentOutstanding: 0 }, dolly = current?.dolly ?? { previousOutstanding: 0, issuedToday: 0, returnedToday: 0, currentOutstanding: 0 }, crateCost = Number(rate?.crateCost ?? 0), dollyCost = Number(rate?.dollyCost ?? 0), short = Math.max(0, crate.previousOutstanding - crate.allowance), exposure = short * crateCost, within = short === 0, util = crate.allowance ? crate.previousOutstanding / crate.allowance * 100 : 0, bar = Math.min(100, util);
    function downloadHistory() {
        if (!history.length) return;

        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const reportName = isAll
            ? 'All EDOs'
            : current ? `${savedEdoName(current)} — Route ${selectedRoute}` : `Route ${selectedRoute}`;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text('Crate & Dolly Reconciliation Report', 14, 16);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(reportName, 14, 23);
        doc.text(`Period: ${prettyDate(fromDate)} to ${prettyDate(toDate)}`, 14, 29);

        const headers = ['Date', 'Route', 'Crate Prev.', 'Allowance', 'Short', 'Exposure', 'Dolly Prev.', 'Dolly Current'];
        const widths = [31, 25, 32, 30, 25, 45, 36, 36];
        const xStart = 14;
        let y = 40;

        const drawHeader = () => {
            let x = xStart;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            headers.forEach((header, index) => {
                doc.text(header, x, y);
                x += widths[index];
            });
            y += 3;
            doc.line(xStart, y, 282, y);
            y += 6;
            doc.setFont('helvetica', 'normal');
        };

        drawHeader();

        for (const r of [...history].reverse()) {
            if (y > 190) {
                doc.addPage();
                y = 15;
                drawHeader();
            }

            const applicableRate = rateFor(r.reconDate);
            const replacementCost = Number(applicableRate?.crateCost ?? 0);
            const cratesShort = Math.max(0, r.crate.previousOutstanding - r.crate.allowance);
            const chargeExposure = cratesShort * replacementCost;

            const row = [
                prettyDate(r.reconDate),
                r.routeNo,
                String(r.crate.previousOutstanding),
                String(r.crate.allowance),
                String(cratesShort),
                money(chargeExposure),
                String(r.dolly.previousOutstanding),
                String(r.dolly.currentOutstanding),
            ];

            let x = xStart;
            row.forEach((value, index) => {
                doc.text(value, x, y);
                x += widths[index];
            });
            y += 7;
        }

        if (y > 184) {
            doc.addPage();
            y = 20;
        } else {
            y += 5;
        }

        doc.setFontSize(8);
        doc.setTextColor(90);
        doc.text(
            'Potential Charge Exposure is indicative risk only and does not represent an actual Premier charge, invoice or deduction.',
            14,
            y
        );

        doc.save(`crate-dolly-recon_${isAll ? 'all-edos' : selectedRoute}_${fromDate || 'start'}_${toDate || 'latest'}.pdf`);
    }

    if (loading) return <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div>; return <div className="space-y-6"><div className="flex flex-wrap items-center justify-between gap-3"><Button asChild variant="ghost" className="-ml-3"><Link href="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" />Back to Dashboard</Link></Button><div className="flex gap-2">{user?.userType === 'taskraft' && <Button asChild variant="outline"><Link href="/accounting/crate-control/upload"><FileSpreadsheet className="mr-2 h-4 w-4" />Upload Premier Recon</Link></Button>}{user?.accessLevel === 'superadmin' && <Button asChild variant="outline"><Link href="/accounting/crate-control/settings"><Settings className="mr-2 h-4 w-4" />Replacement Costs</Link></Button>}</div></div><div><h1 className="text-3xl font-bold">Crate & Dolly Control</h1><p className="text-muted-foreground">Live Premier reconciliation positions from imported recon data.</p></div>{error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}{!recons.length ? <Card><CardContent className="py-12 text-center">No Premier reconciliation imported yet.</CardContent></Card> : <>
        <Card><CardContent className="flex flex-wrap items-end gap-4 pt-6"><div className="min-w-[260px] flex-1"><label className="text-sm font-medium">View</label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={selectedRoute} onChange={e => setSelectedRoute(e.target.value)}>{user?.userType === 'taskraft' && <option value={ALL}>All EDOs — Latest Position</option>}{routes.map(r => <option key={r} value={r}>{r}</option>)}</select></div>{isAll ? <><div className="flex-1"><div className="text-xs uppercase text-muted-foreground">Admin View</div><div className="mt-2 font-semibold">All EDOs / Routes</div></div><div><div className="text-xs uppercase text-muted-foreground">Latest Position</div><div className="mt-2 font-semibold">{prettyDate(latestDate)}</div></div></> : <><div className="flex-1"><div className="text-xs uppercase text-muted-foreground">EDO</div><div className="mt-2 font-semibold">{current ? savedEdoName(current) : '—'}</div></div><div><div className="text-xs uppercase text-muted-foreground">Site</div><div className="mt-2 font-semibold capitalize">{current?.site || '—'}</div></div></>}</CardContent></Card>
        {isAll ? <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Total Crates Outstanding</div><div className="text-3xl font-bold">{totals.prev}</div><div className="text-xs text-muted-foreground">Previous outstanding across {latestAll.length} routes</div></CardContent></Card><Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Total Allowance</div><div className="text-3xl font-bold">{totals.allow}</div></CardContent></Card><Card className={totals.short ? 'border-red-200 bg-red-50' : ''}><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Total Crates Short</div><div className={`text-3xl font-bold ${totals.short ? 'text-red-700' : 'text-emerald-700'}`}>{totals.short}</div></CardContent></Card><Card className={totals.exposure ? 'border-red-200 bg-red-50' : ''}><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Potential Charge Exposure</div><div className={`text-3xl font-bold ${totals.exposure ? 'text-red-700' : ''}`}>{money(totals.exposure)}</div><div className="text-xs text-muted-foreground">Indicative risk only</div></CardContent></Card></div><div className="grid gap-4 sm:grid-cols-3"><Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Current Crate Position</div><div className="text-3xl font-bold">{totals.current}</div></CardContent></Card><Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Dollies Outstanding</div><div className="text-3xl font-bold">{totals.dollyPrev}</div></CardContent></Card><Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Current Dolly Position</div><div className="text-3xl font-bold">{totals.dollyCurrent}</div></CardContent></Card></div><Card><CardHeader><CardTitle>EDO / Route Position — {prettyDate(latestDate)}</CardTitle><CardDescription>Latest position for every route in the admin view. Click any heading to sort.</CardDescription></CardHeader><CardContent><CrateAdminRouteTable rows={latestAll} rates={rates} /></CardContent></Card></> : <>{within ? <Card className="border-emerald-300 bg-emerald-50"><CardContent className="flex items-center gap-3 pt-6 text-emerald-800"><ShieldCheck className="h-7 w-7" /><div><div className="text-sm font-semibold uppercase">Within Crate Allowance</div><div className="text-2xl font-bold">{Math.max(0, crate.allowance - crate.previousOutstanding)} crates available</div></div></CardContent></Card> : <Card className="border-red-300 bg-red-50"><CardContent className="flex flex-col gap-4 pt-6 md:flex-row md:items-center md:justify-between"><div className="flex gap-3"><AlertTriangle className="h-7 w-7 text-red-700" /><div><div className="text-sm font-semibold uppercase text-red-700">Over Crate Allowance</div><div className="text-3xl font-bold text-red-700">{short} crates short</div><div className="text-sm text-red-800">Previous outstanding {crate.previousOutstanding} minus allowance {crate.allowance}.</div></div></div><div className="md:text-right"><div className="text-sm text-red-700">Potential Charge Exposure</div><div className="text-4xl font-bold text-red-700">{money(exposure)}</div><div className="text-xs text-red-700">Indicative risk only — not an actual Premier charge.</div></div></CardContent></Card>}<div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle>Crate Allowance Position</CardTitle><CardDescription>Exposure is calculated from previous outstanding only.</CardDescription></CardHeader><CardContent className="space-y-6"><div className="grid gap-4 sm:grid-cols-3"><div className="rounded-xl border p-4"><div className="text-xs uppercase text-muted-foreground">Allowance</div><div className="mt-1 text-2xl font-bold">{crate.allowance}</div></div><div className="rounded-xl border p-4"><div className="text-xs uppercase text-muted-foreground">Utilisation</div><div className="mt-1 text-2xl font-bold">{util.toFixed(1)}%</div></div><div className="rounded-xl border p-4"><div className="text-xs uppercase text-muted-foreground">Replacement Cost</div><div className="mt-1 text-2xl font-bold">{money(crateCost)}</div><div className="text-xs text-muted-foreground">{rate ? `Effective ${prettyDate(rate.effectiveFrom)}` : 'No applicable rate'}</div></div></div><div><div className="mb-2 flex justify-between text-sm"><span>Previous outstanding vs allowance</span><b>{crate.previousOutstanding} / {crate.allowance}</b></div><div className="h-3 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${within ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${bar}%` }} /></div></div><div className="rounded-lg bg-muted/40 p-4 text-sm"><b>Exposure calculation:</b> ({crate.previousOutstanding} previous outstanding − {crate.allowance} allowance) × {money(crateCost)} = <b className={exposure ? 'text-red-700' : 'text-emerald-700'}>{money(exposure)}</b></div></CardContent></Card><Card><CardHeader><CardTitle>Dolly Position</CardTitle><CardDescription>Current Premier dolly movement.</CardDescription></CardHeader><CardContent className="space-y-5"><div className="grid grid-cols-2 gap-4">{[['Previous Outstanding', dolly.previousOutstanding], ['Issued Today', dolly.issuedToday], ['Returned Today', dolly.returnedToday], ['Current Outstanding', dolly.currentOutstanding]].map(([a, b]) => <div key={String(a)} className="rounded-xl border p-4"><div className="text-xs text-muted-foreground">{a}</div><div className="mt-1 text-2xl font-bold">{b}</div></div>)}</div><div className="text-sm text-muted-foreground">Replacement cost: <b className="text-foreground">{money(dollyCost)}</b> • {rate ? `Effective ${prettyDate(rate.effectiveFrom)} Admin rate` : 'No applicable rate'}</div></CardContent></Card></div></>}
        <Card><CardHeader><div className="flex flex-wrap items-end justify-between gap-4"><div><CardTitle>Reconciliation History — {isAll ? 'All EDOs' : selectedRoute}</CardTitle><CardDescription>Defaults to 7 days. Select a range and download the displayed data.</CardDescription></div><div className="flex flex-wrap items-end gap-2"><div><label className="text-xs text-muted-foreground">From</label><input type="date" className="mt-1 block h-9 rounded-md border px-2" value={fromDate} onChange={e => setFromDate(e.target.value)} /></div><div><label className="text-xs text-muted-foreground">To</label><input type="date" className="mt-1 block h-9 rounded-md border px-2" value={toDate} onChange={e => setToDate(e.target.value)} /></div><Button variant="outline" onClick={downloadHistory} disabled={!history.length}><Download className="mr-2 h-4 w-4" />Download PDF</Button></div></div></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-sm"><thead><tr className="border-b bg-muted/40"><th className="p-3 text-left">Date</th>{isAll && <><th className="text-left">Route</th><th className="text-left">EDO</th></>}<th className="text-right">Crate Previous</th><th className="text-right">Allowance</th><th className="text-right">Short</th><th className="text-right">Exposure</th><th className="text-right">Dolly Previous</th><th className="pr-3 text-right">Dolly Current</th></tr></thead><tbody>{history.map(r => { const s = Math.max(0, r.crate.previousOutstanding - r.crate.allowance), e = s * Number(rateFor(r.reconDate)?.crateCost ?? 0); return <tr key={r.id} className="border-b"><td className="p-3">{prettyDate(r.reconDate)}</td>{isAll && <><td>{r.routeNo}</td><td>{savedEdoName(r)}</td></>}<td className="text-right">{r.crate.previousOutstanding}</td><td className="text-right">{r.crate.allowance}</td><td className="text-right">{s}</td><td className="text-right">{money(e)}</td><td className="text-right">{r.dolly.previousOutstanding}</td><td className="pr-3 text-right">{r.dolly.currentOutstanding}</td></tr> })}</tbody></table></div></CardContent></Card></>}</div>;
}
