"use client";

import { useState } from "react";
import { auth } from "@/lib/firebase";
import { CheckCircle2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type SyncResult = {
  totalUsers: number;
  synced: number;
  skipped: number;
  errors: string[];
};

export default function SyncUserAccessPage() {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState("");

  async function syncUserAccess() {
    if (!window.confirm("Server-sync userAccess records from the existing users collection?")) return;

    try {
      setSyncing(true);
      setError("");
      setResult(null);

      const user = auth.currentUser;
      if (!user) throw new Error("Your authenticated session is not available.");
      const token = await user.getIdToken();
      const response = await fetch("/api/admin/user-access-sync", {
        method: "POST",
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || `User access sync failed (${response.status}).`);

      setResult({
        totalUsers: Number(data.totalUsers || 0),
        synced: Number(data.synced || 0),
        skipped: Number(data.skipped || 0),
        errors: Array.isArray(data.errors) ? data.errors : [],
      });
    } catch (syncError) {
      console.error("User access sync failed:", syncError);
      setError(syncError instanceof Error ? syncError.message : "User access sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">User Access Sync</h1>
        <p className="text-muted-foreground">Repair/synchronize the BizCentral authorization layer from existing user records through a Superadmin-only server operation.</p>
      </div>

      {error && <div className="rounded-md border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-700">{error}</div>}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Sync User Access</CardTitle>
          <CardDescription>The browser no longer reads all users or writes userAccess. The server verifies canonical Superadmin authorization before performing the repair sync.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-md border bg-muted/30 p-4">
            <div className="font-medium">Authorization Structure</div>
            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
              <div><span className="font-medium text-foreground">users</span> = profile and legacy/source user information</div>
              <div><span className="font-medium text-foreground">userAccess</span> = canonical security and authorization</div>
            </div>
          </div>

          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
            <div className="font-medium">Repair operation</div>
            <p className="mt-2 text-muted-foreground">Use this only when authorization records need to be repaired or synchronized. Normal approvals, rejections and removals are handled by User Approvals and its server API.</p>
          </div>

          <Button type="button" onClick={syncUserAccess} disabled={syncing}>
            {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {syncing ? "Syncing..." : "Sync User Access"}
          </Button>

          {result && (
            <div className="rounded-md border border-green-500/40 bg-green-500/5 p-5">
              <div className="flex items-center gap-2 font-medium text-green-700"><CheckCircle2 className="h-5 w-5" />Sync Complete</div>
              <div className="mt-4 grid gap-4 sm:grid-cols-4">
                <div><div className="text-xs text-muted-foreground">Users Found</div><div className="text-2xl font-bold">{result.totalUsers}</div></div>
                <div><div className="text-xs text-muted-foreground">Synced</div><div className="text-2xl font-bold text-green-700">{result.synced}</div></div>
                <div><div className="text-xs text-muted-foreground">Skipped</div><div className="text-2xl font-bold">{result.skipped}</div></div>
                <div><div className="text-xs text-muted-foreground">Errors</div><div className={result.errors.length ? "text-2xl font-bold text-red-700" : "text-2xl font-bold"}>{result.errors.length}</div></div>
              </div>
              {result.errors.length > 0 && <div className="mt-4 text-sm text-red-700">Failed UIDs: {result.errors.join(", ")}</div>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
