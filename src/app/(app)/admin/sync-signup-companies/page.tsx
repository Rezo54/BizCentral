// src/app/(app)/admin/sync-signup-companies/page.tsx

"use client";

import { useState } from "react";

import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

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

/* =========================================================
   TYPES
========================================================= */

type SyncResult = {
  edoFound: number;
  edoSynced: number;

  relieversFound: number;
  relieversSynced: number;

  totalSynced: number;

  skipped: number;

  errors: string[];
};

/* =========================================================
   PAGE
========================================================= */

export default function SyncSignupCompaniesPage() {

  const [
    syncing,
    setSyncing,
  ] = useState(false);

  const [
    result,
    setResult,
  ] =
    useState<SyncResult | null>(
      null
    );

  const [
    error,
    setError,
  ] = useState("");

  /* =======================================================
     SYNC
  ======================================================= */

  async function syncSignupCompanies() {

    const confirmed =
      window.confirm(
        "Build/update the public signup company directory from existing EDO and Reliever records?"
      );

    if (!confirmed) {
      return;
    }

    try {

      setSyncing(true);

      setError("");

      setResult(null);

      /* ===================================================
         LOAD SOURCE COLLECTIONS
      =================================================== */

      const [
        companySnapshot,
        relieverSnapshot,
      ] =
        await Promise.all([
          getDocs(
            collection(
              db,
              "companies"
            )
          ),

          getDocs(
            collection(
              db,
              "relievers"
            )
          ),
        ]);

      /* ===================================================
         COUNTERS
      =================================================== */

      let edoFound = 0;

      let edoSynced = 0;

      let relieversFound = 0;

      let relieversSynced = 0;

      let skipped = 0;

      const errors: string[] =
        [];

      /* ===================================================
         FIRESTORE BATCH

         Firestore batches have a write limit.

         We therefore commit periodically rather than
         building one unlimited batch.
      =================================================== */

      let batch =
        writeBatch(db);

      let batchWrites = 0;

      async function commitBatchIfNeeded(
        force = false
      ) {

        if (
          batchWrites >= 400 ||
          (
            force &&
            batchWrites > 0
          )
        ) {

          await batch.commit();

          batch =
            writeBatch(db);

          batchWrites = 0;
        }
      }

      /* ===================================================
         EDO COMPANIES
      =================================================== */

      for (
        const companyDoc
        of companySnapshot.docs
      ) {

        const company =
          companyDoc.data();

        const companyType =
          String(
            company.type || ""
          )
            .trim()
            .toLowerCase();

        /*
          Only EDO companies belong in
          the EDO signup directory.
        */

        if (
          companyType !== "edo"
        ) {
          continue;
        }

        edoFound++;

        const name =
          String(
            company.name || ""
          ).trim();

        if (!name) {

          skipped++;

          errors.push(
            `EDO ${companyDoc.id}: missing company name`
          );

          continue;
        }

        try {

          const signupRef =
            doc(
              db,
              "signupCompanies",
              companyDoc.id
            );

          batch.set(
            signupRef,
            {
              name,

              type:
                "edo",

              active:
                true,

              /*
                Retained for traceability.

                This is NOT sensitive operational data.
              */

              sourceId:
                companyDoc.id,

              updatedAt:
                serverTimestamp(),
            },
            {
              merge: true,
            }
          );

          batchWrites++;

          edoSynced++;

          await commitBatchIfNeeded();

        } catch (writeError) {

          console.error(
            `Unable to prepare EDO ${companyDoc.id}:`,
            writeError
          );

          errors.push(
            `EDO ${companyDoc.id}`
          );
        }
      }

      /* ===================================================
         RELIEVER COMPANIES
      =================================================== */

      for (
        const relieverDoc
        of relieverSnapshot.docs
      ) {

        const reliever =
          relieverDoc.data();

        relieversFound++;

        /*
          Existing Reliever records appear to use either:

          businessName

          or

          name

          We support both.
        */

        const name =
          String(
            reliever.businessName ||
            reliever.name ||
            ""
          ).trim();

        if (!name) {

          skipped++;

          errors.push(
            `Reliever ${relieverDoc.id}: missing business name`
          );

          continue;
        }

        try {

          /*
            Prefix Reliever document IDs.

            This prevents a theoretical ID collision
            between /companies and /relievers.

            IMPORTANT:

            sourceId still retains the REAL reliever ID.
          */

          const publicDocumentId =
            `reliever-${relieverDoc.id}`;

          const signupRef =
            doc(
              db,
              "signupCompanies",
              publicDocumentId
            );

          batch.set(
            signupRef,
            {
              name,

              type:
                "reliever",

              active:
                true,

              /*
                Real /relievers document ID.

                Signup must use sourceId when creating
                userData.relieverId.
              */

              sourceId:
                relieverDoc.id,

              updatedAt:
                serverTimestamp(),
            },
            {
              merge: true,
            }
          );

          batchWrites++;

          relieversSynced++;

          await commitBatchIfNeeded();

        } catch (writeError) {

          console.error(
            `Unable to prepare Reliever ${relieverDoc.id}:`,
            writeError
          );

          errors.push(
            `Reliever ${relieverDoc.id}`
          );
        }
      }

      /* ===================================================
         COMMIT REMAINING WRITES
      =================================================== */

      await commitBatchIfNeeded(
        true
      );

      /* ===================================================
         RESULT
      =================================================== */

      setResult({
        edoFound,

        edoSynced,

        relieversFound,

        relieversSynced,

        totalSynced:
          edoSynced +
          relieversSynced,

        skipped,

        errors,
      });

    } catch (syncError) {

      console.error(
        "Signup company sync failed:",
        syncError
      );

      setError(
        "Signup company sync failed. Check the browser console for details."
      );

    } finally {

      setSyncing(false);

    }
  }

  /* =======================================================
     PAGE
  ======================================================= */

  return (

    <div className="flex flex-col gap-8">

      {/* =================================================
          HEADER
      ================================================= */}

      <div>

        <h1 className="text-3xl font-bold tracking-tight">
          Signup Companies Sync
        </h1>

        <p className="text-muted-foreground">
          Build the safe public company directory used during BizCentral registration.
        </p>

      </div>

      {/* =================================================
          ERROR
      ================================================= */}

      {error && (

        <div className="rounded-md border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-700">
          {error}
        </div>

      )}

      {/* =================================================
          SYNC CARD
      ================================================= */}

      <Card>

        <CardHeader>

          <CardTitle className="flex items-center gap-2">

            <ShieldCheck className="h-5 w-5" />

            Public Signup Directory

          </CardTitle>

          <CardDescription>

            Synchronises EDO and Reliever businesses into
            the limited public signupCompanies collection.

          </CardDescription>

        </CardHeader>

        <CardContent className="space-y-6">

          {/* ===============================================
              ARCHITECTURE
          =============================================== */}

          <div className="rounded-md border bg-muted/30 p-4">

            <div className="font-medium">
              Directory structure
            </div>

            <div className="mt-3 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">

              <div className="flex gap-2">

                <Building2 className="mt-0.5 h-4 w-4 shrink-0" />

                <div>

                  <div className="font-medium text-foreground">
                    EDO Companies
                  </div>

                  companies → signupCompanies

                </div>

              </div>

              <div className="flex gap-2">

                <Truck className="mt-0.5 h-4 w-4 shrink-0" />

                <div>

                  <div className="font-medium text-foreground">
                    Reliever Companies
                  </div>

                  relievers → signupCompanies

                </div>

              </div>

            </div>

          </div>

          {/* ===============================================
              PUBLIC FIELDS
          =============================================== */}

          <div className="rounded-md border p-4">

            <div className="font-medium">
              Public information only
            </div>

            <div className="mt-2 text-sm text-muted-foreground">

              signupCompanies contains only:

              <br />

              name · type · active · sourceId · updatedAt

            </div>

          </div>

          {/* ===============================================
              BUTTON
          =============================================== */}

          <Button
            type="button"
            onClick={
              syncSignupCompanies
            }
            disabled={
              syncing
            }
          >

            {syncing ? (

              <Loader2 className="mr-2 h-4 w-4 animate-spin" />

            ) : (

              <RefreshCw className="mr-2 h-4 w-4" />

            )}

            {syncing
              ? "Syncing..."
              : "Sync Signup Companies"}

          </Button>

          {/* ===============================================
              RESULTS
          =============================================== */}

          {result && (

            <div className="rounded-md border border-green-500/40 bg-green-500/5 p-5">

              <div className="flex items-center gap-2 font-medium text-green-700">

                <CheckCircle2 className="h-5 w-5" />

                Sync Complete

              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">

                {/* EDO */}

                <div>

                  <div className="flex items-center gap-1 text-xs text-muted-foreground">

                    <Building2 className="h-3 w-3" />

                    EDOs Found

                  </div>

                  <div className="text-2xl font-bold">
                    {result.edoFound}
                  </div>

                </div>

                {/* EDO SYNC */}

                <div>

                  <div className="text-xs text-muted-foreground">
                    EDOs Synced
                  </div>

                  <div className="text-2xl font-bold text-green-700">
                    {result.edoSynced}
                  </div>

                </div>

                {/* RELIEVERS */}

                <div>

                  <div className="flex items-center gap-1 text-xs text-muted-foreground">

                    <Users className="h-3 w-3" />

                    Relievers Found

                  </div>

                  <div className="text-2xl font-bold">
                    {result.relieversFound}
                  </div>

                </div>

                {/* RELIEVER SYNC */}

                <div>

                  <div className="text-xs text-muted-foreground">
                    Relievers Synced
                  </div>

                  <div className="text-2xl font-bold text-green-700">
                    {result.relieversSynced}
                  </div>

                </div>

                {/* TOTAL */}

                <div>

                  <div className="text-xs text-muted-foreground">
                    Total Directory
                  </div>

                  <div className="text-2xl font-bold">
                    {result.totalSynced}
                  </div>

                </div>

              </div>

              {/* ===========================================
                  SKIPPED / ERRORS
              =========================================== */}

              {(result.skipped > 0 ||
                result.errors.length > 0) && (

                <div className="mt-5 border-t pt-4">

                  <div className="text-sm font-medium">
                    Review
                  </div>

                  <div className="mt-1 text-sm text-muted-foreground">
                    Skipped: {result.skipped}
                  </div>

                  {result.errors.length > 0 && (

                    <div className="mt-2 text-sm text-red-700">

                      {result.errors.join(
                        ", "
                      )}

                    </div>

                  )}

                </div>

              )}

            </div>

          )}

        </CardContent>

      </Card>

    </div>
  );
}