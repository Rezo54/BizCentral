'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { db } from '@/lib/firebase';
import { Card, CardContent } from '@/components/ui/card';

type Recon = {
  id: string;
  routeNo: string;
  reconDate: string;
  crate?: {
    allowance?: number;
    previousOutstanding?: number;
  };
};

export default function EdoCrateShortCard({ edoId }: { edoId: string }) {
  const [rows, setRows] = useState<Recon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'crateReconDaily'), where('edoId', '==', edoId)));
        if (!active) return;
        setRows(snap.docs.map(d => ({ id: d.id, ...d.data() } as Recon)));
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Unable to load crate position.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [edoId]);

  const position = useMemo(() => {
    const valid = rows.filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.reconDate || ''));
    if (!valid.length) return null;
    const latestDate = valid.reduce((max, r) => r.reconDate > max ? r.reconDate : max, valid[0].reconDate);
    const latest = valid.filter(r => r.reconDate === latestDate);
    const short = latest.reduce((sum, r) => {
      const previous = Number(r.crate?.previousOutstanding || 0);
      const allowance = Number(r.crate?.allowance || 0);
      return sum + Math.max(0, previous - allowance);
    }, 0);
    return { latestDate, routes: latest.length, short };
  }, [rows]);

  if (loading) return <Card className="border-amber-200"><CardContent className="flex min-h-28 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></CardContent></Card>;
  if (error || !position) return null;

  const clear = position.short === 0;
  return (
    <Link href="/accounting/crate-control" className="block active:scale-[0.99]">
      <Card className={clear ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50'}>
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className={clear ? 'mt-0.5 text-emerald-700' : 'mt-0.5 text-red-700'}>
              {clear ? <CheckCircle2 className="h-7 w-7" /> : <AlertTriangle className="h-7 w-7" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className={`text-xs font-bold uppercase tracking-wide ${clear ? 'text-emerald-700' : 'text-red-700'}`}>Crate Position</p>
              <div className={`mt-1 text-3xl font-bold sm:text-4xl ${clear ? 'text-emerald-800' : 'text-red-700'}`}>
                {clear ? 'Within allowance' : `${position.short} crates short`}
              </div>
              <p className={`mt-1 text-sm ${clear ? 'text-emerald-800' : 'text-red-800'}`}>
                Latest Premier position across {position.routes} route{position.routes === 1 ? '' : 's'}.
              </p>
              <div className={`mt-3 flex items-center text-sm font-semibold ${clear ? 'text-emerald-800' : 'text-red-800'}`}>
                View crate details <ArrowRight className="ml-1 h-4 w-4" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
