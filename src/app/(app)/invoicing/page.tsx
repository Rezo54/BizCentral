//src/app/(app)/invoicing/page.tsx

"use client";

import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import NoAccess from "@/components/no-access";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useEffect } from "react";

export default function InvoicingHomePage() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
  async function loadUser() {
    const u = await getCurrentUser();
    setUser(u);
  }
  loadUser();
}, []);

if (!user) return null;

  const reliever = user.userType === "reliever";
  const edo = user.userType === "edo";
  const taskraft = user.userType === "taskraft";

  const admin =
  user.accessLevel === "admin" ||
  user.accessLevel === "superadmin";

  const canAccessInvoicing =
  reliever || edo || taskraft || admin;

  if (!canAccessInvoicing) {
  return <NoAccess hint="Invoicing is restricted." />;
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <header>
        <h1 className="text-2xl md:text-3xl font-semibold">Invoicing</h1>
        <p className="text-sm text-muted-foreground">
          Capture relief work, approve invoices, and view summaries.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {reliever && (
         <Card>
            <CardHeader>
              <CardTitle>I am a Reliever</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Submit your relief invoices and track approvals.</p>

              <div className="flex gap-2 mt-3">
                <Button asChild>
                  <a href="/invoicing/reliever">Reliever Invoicing</a>
                </Button>

                <Button variant="outline" asChild>
                  <a href="/invoicing/reliever/summary">My Summary</a>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {(edo || admin) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Approve Reliever Invoices</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                Review, approve or reject submitted invoices.
              </p>
              <Button asChild className="w-full sm:w-auto">
                <a href="/invoicing/reliever/approve">Approval Console</a>
              </Button>
            </CardContent>
          </Card>
        )}

        {(edo || admin) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Summary &amp; History</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                Totals by reliever, date, route, and type.
              </p>
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <Link href="/invoicing/reliever/summary">Open Summary</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}