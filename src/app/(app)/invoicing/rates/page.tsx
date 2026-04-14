"use client";

import { useEffect, useState } from "react";
import { getCurrentUser } from "@/lib/session";
import NoAccess from "@/components/no-access";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getAllRates, setRate } from "@/data/invoicing";

export default function RatesAdminPage() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
  async function loadUser() {
    const u = await getCurrentUser();
    setUser(u);
  }
  loadUser();
}, []);

if (!user) return null;
  const isAdmin = user.role === "super_admin" || user.role === "admin_user";
  if (!isAdmin) return <NoAccess hint="Only admins can edit rate rules." />;

  const [rates, setRates] = useState(getAllRates());
  function upd<K extends keyof typeof rates>(k: K, v: string) {
    const n = Number(v || "0");
    if (Number.isFinite(n)) setRates(r => ({ ...r, [k]: n }));
  }
  function save() {
    (Object.keys(rates) as Array<keyof typeof rates>).forEach(k => setRate(k, rates[k]));
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-semibold">Relief Rate Matrix</h1>
        <p className="text-sm text-muted-foreground">Update rates used by reliever invoices (R per event).</p>
      </header>

      <Card>
        <CardHeader><CardTitle className="text-base">Rates</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="block text-xs mb-1">Day Relief</label>
            <Input type="number" value={rates.day} onChange={e => upd("day", e.target.value)} />
          </div>
          <div>
            <label className="block text-xs mb-1">Second Delivery</label>
            <Input type="number" value={rates.second_delivery} onChange={e => upd("second_delivery", e.target.value)} />
          </div>
          <div>
            <label className="block text-xs mb-1">Sunday / Public Holiday</label>
            <Input type="number" value={rates.sunday_ph} onChange={e => upd("sunday_ph", e.target.value)} />
          </div>
          <div className="md:col-span-3">
            <Button onClick={save}>Save Rates</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
