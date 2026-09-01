'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

type Recon = {
  id: string;
  routeNo: string;
  edoId?: string;
  sourceName?: string;
  reconDate: string;
  crate: { allowance: number; previousOutstanding: number; currentOutstanding: number };
  dolly: { previousOutstanding: number; currentOutstanding: number };
};
type Rate = { crateCost: number; effectiveFrom: string };
type SortKey = 'route'|'edo'|'previous'|'allowance'|'short'|'exposure'|'current'|'dollyPrevious'|'dollyCurrent';

const money=(v:number)=>new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR',minimumFractionDigits:2}).format(v||0);
const edoName=(r:Recon)=>{if(!r.edoId)return r.sourceName||'—';let n=r.edoId.replace(/^edo-/i,'').replace(/-/g,' ').replace(/\benterprise\b/gi,'').replace(/\bpty\s*ltd\b/gi,'').replace(/\s+/g,' ').trim().toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());return n?`${n} (PTY) LTD`:r.sourceName||'—'};

function Heading({label,column,sortKey,direction,onSort,align='right'}:{label:string;column:SortKey;sortKey:SortKey;direction:'asc'|'desc';onSort:(k:SortKey)=>void;align?:'left'|'right'}){
  const active=sortKey===column;
  return <th className={`${align==='right'?'text-right':'text-left'} whitespace-nowrap`}><button type="button" onClick={()=>onSort(column)} className={`inline-flex items-center gap-1.5 py-3 font-semibold hover:text-primary ${align==='right'?'justify-end':''}`} title={`Sort by ${label}`}>{label}{active?(direction==='asc'?<ArrowUp className="h-3.5 w-3.5"/>:<ArrowDown className="h-3.5 w-3.5"/>):<ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/60"/>}</button></th>
}

export default function CrateAdminRouteTable({rows,rates}:{rows:Recon[];rates:Rate[]}){
  const[sortKey,setSortKey]=useState<SortKey>('route');
  const[direction,setDirection]=useState<'asc'|'desc'>('asc');
  const rateFor=(d:string)=>rates.find(r=>r.effectiveFrom<=d)??null;
  const onSort=(key:SortKey)=>{if(key===sortKey)setDirection(v=>v==='asc'?'desc':'asc');else{setSortKey(key);setDirection('asc')}};
  const sorted=useMemo(()=>[...rows].sort((a,b)=>{
    const short=(r:Recon)=>Math.max(0,r.crate.previousOutstanding-r.crate.allowance);
    const exposure=(r:Recon)=>short(r)*Number(rateFor(r.reconDate)?.crateCost??0);
    const values=(r:Recon):Record<SortKey,string|number>=>({route:r.routeNo,edo:edoName(r),previous:r.crate.previousOutstanding,allowance:r.crate.allowance,short:short(r),exposure:exposure(r),current:r.crate.currentOutstanding,dollyPrevious:r.dolly.previousOutstanding,dollyCurrent:r.dolly.currentOutstanding});
    const av=values(a)[sortKey],bv=values(b)[sortKey];let result=typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv),undefined,{numeric:true,sensitivity:'base'});return direction==='asc'?result:-result;
  }),[rows,rates,sortKey,direction]);
  return <div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-sm"><thead><tr className="border-b bg-muted/40"><Heading label="Route" column="route" sortKey={sortKey} direction={direction} onSort={onSort} align="left"/><Heading label="EDO" column="edo" sortKey={sortKey} direction={direction} onSort={onSort} align="left"/><Heading label="Crate Previous" column="previous" sortKey={sortKey} direction={direction} onSort={onSort}/><Heading label="Allowance" column="allowance" sortKey={sortKey} direction={direction} onSort={onSort}/><Heading label="Short" column="short" sortKey={sortKey} direction={direction} onSort={onSort}/><Heading label="Exposure" column="exposure" sortKey={sortKey} direction={direction} onSort={onSort}/><Heading label="Crate Current" column="current" sortKey={sortKey} direction={direction} onSort={onSort}/><Heading label="Dolly Previous" column="dollyPrevious" sortKey={sortKey} direction={direction} onSort={onSort}/><Heading label="Dolly Current" column="dollyCurrent" sortKey={sortKey} direction={direction} onSort={onSort}/></tr></thead><tbody>{sorted.map(r=>{const s=Math.max(0,r.crate.previousOutstanding-r.crate.allowance),e=s*Number(rateFor(r.reconDate)?.crateCost??0);return <tr key={r.id} className="border-b"><td className="p-3 font-medium">{r.routeNo}</td><td>{edoName(r)}</td><td className="text-right">{r.crate.previousOutstanding}</td><td className="text-right">{r.crate.allowance}</td><td className={`text-right font-semibold ${s?'text-red-700':'text-emerald-700'}`}>{s}</td><td className={`text-right font-semibold ${s?'text-red-700':''}`}>{money(e)}</td><td className="text-right">{r.crate.currentOutstanding}</td><td className="text-right">{r.dolly.previousOutstanding}</td><td className="pr-3 text-right">{r.dolly.currentOutstanding}</td></tr>})}</tbody></table></div>;
}
