"use client";

import { useState } from "react";
import { auth } from "@/lib/firebase";
import {
  Building2,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Truck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type SyncResult = {
  edoFound: number;
  edoSynced: number;
  relieversFound: number;
  relieversSynced: number;
  totalSynced: number;
  skipped: number;
  errors: string[];
};

export default function SyncSignupCompaniesPage() {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState("");

  async function syncSignupCompanies() {
    if (!window.confirm("Build/update the public signup company directory from existing EDO and Reliever records?")) return;

    try {
      setSyncing(true);
      setError("");
      setResult(null);

      const user = auth.currentUser;
      if (!user) throw new Error("Please sign in again.");

      const token = await user.getIdToken();
      const response = await fetch("/api/admin/master-data/signup-companies-sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.message || "Signup company sync failed.");

      setResult({
        edoFound: data.edoFound ?? 0,
        edoSynced: data.edoSynced ?? 0,
        relieversFound: data.relieversFound ?? 0,
        relieversSynced: data.relieversSynced ?? 0,
        totalSynced: data.totalSynced ?? 0,
        skipped: data.skipped ?? 0,
        errors: Array.isArray(data.errors) ? data.errors : [],
      });
    } catch (syncError) {
      console.error("Signup company sync failed:", syncError);
      setError(syncError instanceof Error ? syncError.message : "Signup company sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Signup Companies Sync</h1>
        <p className="text-muted-foreground">Build the safe public company directory used during BizCentral registration.</p>
      </div>

      {error && <div className="rounded-md border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-700">{error}</div>}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Public Signup Directory</CardTitle>
          <CardDescription>Synchronises EDO and Reliever businesses into the limited public signupCompanies collection.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-md border bg-muted/30 p-4">
            <div className="font-medium">Directory structure</div>
            <div className="mt-3 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
              <div className="flex gap-2"><Building2 className="mt-0.5 h-4 w-4 shrink-0" /><div><div className="font-medium text-foreground">EDO Companies</div>companies → signupCompanies</div></div>
              <div className="flex gap-2"><Truck className="mt-0.5 h-4 w-4 shrink-0" /><div><div className="font-medium text-foreground">Reliever Companies</div>relievers → signupCompanies</div></div>
            </div>
          </div>

          <div className="rounded-md border p-4">
            <div className="font-medium">Public information only</div>
            <div className="mt-2 text-sm text-muted-foreground">signupCompanies contains only:<br />name · type · active · sourceId · updatedAt</div>
          </div>

          <Button type="button" onClick={syncSignupCompanies} disabled={syncing}>
            {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {syncing ? "Syncing..." : "Sync Signup Companies"}
          </Button>

          {result && (
            <div className="rounded-md border border-green-500/40 bg-green-500/5 p-5">
              <div className="flex items-center gap-2 font-medium text-green-700"><CheckCircle2 className="h-5 w-5" />Sync Complete</div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div><div className="flex items-center gap-1 text-xs text-muted-foreground"><Building2 className="h-3 w-3" />EDOs Found</div><div className="text-2xl font-bold">{result.edoFound}</div></div>
                <div><div className="text-xs text-muted-foreground">EDOs Synced</div><div className="text-2xl font-bold text-green-700">{result.edoSynced}</div></div>
                <div><div className="flex items-center gap-1 text-xs text-muted-foreground"><Users className="h-3 w-3" />Relievers Found</div><div className="text-2xl font-bold">{result.relieversFound}</div></div>
                <div><div className="text-xs text-muted-foreground">Relievers Synced</div><div className="text-2xl font-bold text-green-700">{result.relieversSynced}</div></div>
                <div><div className="text-xs text-muted-foreground">Total Directory</div><div className="text-2xl font-bold">{result.totalSynced}</div></div>
              </div>
              {(result.skipped > 0 || result.errors.length > 0) && (
                <div className="mt-5 border-t pt-4">
                  <div className="text-sm font-medium">Review</div>
                  <div className="mt-1 text-sm text-muted-foreground">Skipped: {result.skipped}</div>
                  {result.errors.length > 0 && <div className="mt-2 text-sm text-red-700">{result.errors.join(", ")}</div>}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
