"use client";

import { useState } from "react";
import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CheckCircle2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type SyncResult = {
  totalUsers: number;
  created: number;
  skipped: number;
  errors: string[];
};

export default function SyncUserAccessPage() {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState("");

  async function syncUserAccess() {
    const confirmed = window.confirm(
      "Create/update userAccess records from the existing users collection?"
    );

    if (!confirmed) return;

    try {
      setSyncing(true);
      setError("");
      setResult(null);

      const usersSnapshot = await getDocs(collection(db, "users"));
      let created = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const userDoc of usersSnapshot.docs) {
        const user = userDoc.data();
        const uid = String(user.uid || "").trim();

        if (!uid) {
          skipped++;
          console.warn("Skipping user without UID:", userDoc.id);
          continue;
        }

        const name = String(user.name || "").trim();
        const email = String(user.email || "").trim().toLowerCase();
        const userType = String(user.userType || "").trim().toLowerCase();
        const accessLevel = String(user.accessLevel || "").trim().toLowerCase();
        const accountRole = String(user.accountRole || "").trim().toLowerCase();
        const status = String(user.status || "").trim().toLowerCase();
        const companyId = user.companyId ? String(user.companyId).trim() : null;

        try {
          await setDoc(
            doc(db, "userAccess", uid),
            {
              uid,
              name,
              email,
              userType,
              accessLevel,
              accountRole,
              status,
              companyId,
              syncedFromUserDoc: userDoc.id,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
          created++;
        } catch (writeError) {
          console.error(`Failed userAccess sync for ${uid}:`, writeError);
          errors.push(uid);
        }
      }

      setResult({
        totalUsers: usersSnapshot.size,
        created,
        skipped,
        errors,
      });
    } catch (syncError) {
      console.error("User access sync failed:", syncError);
      setError("User access sync failed. Check the browser console for details.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">User Access Sync</h1>
        <p className="text-muted-foreground">
          Build and maintain the BizCentral authorization layer from existing user records.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Sync User Access
          </CardTitle>
          <CardDescription>
            Creates or updates one userAccess document for every existing BizCentral user using their Firebase Authentication UID.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="rounded-md border bg-muted/30 p-4">
            <div className="font-medium">Authorization Structure</div>
            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
              <div><span className="font-medium text-foreground">users</span>{" "}= profile and user information</div>
              <div><span className="font-medium text-foreground">userAccess</span>{" "}= security and authorization</div>
            </div>
          </div>

          <div className="rounded-md border p-4">
            <div className="font-medium">userAccess fields</div>
            <div className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Reference / Audit</div>
                <div className="mt-2">UID</div>
                <div>Name</div>
                <div>Email</div>
                <div>Source User Document</div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Authorization</div>
                <div className="mt-2">User Type</div>
                <div>Access Level</div>
                <div>Account Role</div>
                <div>Company ID</div>
                <div>Status</div>
              </div>
            </div>
          </div>

          <Button type="button" onClick={syncUserAccess} disabled={syncing}>
            {syncing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {syncing ? "Syncing..." : "Sync User Access"}
          </Button>

          {result && (
            <div className="rounded-md border border-green-500/40 bg-green-500/5 p-5">
              <div className="flex items-center gap-2 font-medium text-green-700">
                <CheckCircle2 className="h-5 w-5" />
                Sync Complete
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-4">
                <div><div className="text-xs text-muted-foreground">Users Found</div><div className="text-2xl font-bold">{result.totalUsers}</div></div>
                <div><div className="text-xs text-muted-foreground">Synced</div><div className="text-2xl font-bold text-green-700">{result.created}</div></div>
                <div><div className="text-xs text-muted-foreground">Skipped</div><div className="text-2xl font-bold">{result.skipped}</div></div>
                <div><div className="text-xs text-muted-foreground">Errors</div><div className={result.errors.length > 0 ? "text-2xl font-bold text-red-700" : "text-2xl font-bold"}>{result.errors.length}</div></div>
              </div>
              {result.errors.length > 0 && (
                <div className="mt-4 text-sm text-red-700">Failed UIDs: {result.errors.join(", ")}</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
