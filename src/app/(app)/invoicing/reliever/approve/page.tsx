"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
} from "firebase/firestore";

import Link from "next/link";

import { getCurrentUser } from "@/lib/session";
import NoAccess from "@/components/no-access";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";

export default function RelieverApprovePage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  // =============================
  // FILTER STATE (SAFE)
  // =============================
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [edoFilter, setEdoFilter] = useState("all");
  const [relieverFilter, setRelieverFilter] = useState("all");

  // =============================
  // LOAD DATA
  // =============================
  useEffect(() => {
    async function loadData() {
      const currentUser = await getCurrentUser();
      setUser(currentUser);

      const snap = await getDocs(collection(db, "invoices"));
      let data = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      // 🔒 ROLE FILTERING
      if (currentUser?.userType === "edo") {
        data = data.filter(
          (r: any) => r.edoId === currentUser.companyId
        );
      }

      if (currentUser?.userType === "reliever") {
        data = data.filter(
          (r: any) =>
            r.relieverCompanyId === currentUser.relieverId
        );
      }

      setRows(data);
      setLoading(false);
    }

    loadData();
  }, []);

  if (!user) return null;

  const reliever = user.userType === "reliever";
  const edo = user.userType === "edo";
  const admin = user.accessLevel === "admin";
  const superadmin = user.accessLevel === "superadmin";

  // ❌ BLOCK RELIEVER
  if (reliever) {
    return <NoAccess hint="Relievers cannot approve invoices" />;
  }

  if (!edo && !admin && !superadmin) {
    return <NoAccess hint="No approval access" />;
  }

  const canApprove = edo || superadmin;

  // =============================
  // FILTER LOGIC (SAFE)
  // =============================
  let filtered = [...rows];

  if (from) {
    filtered = filtered.filter((r: any) => r.date >= from);
  }

  if (to) {
    filtered = filtered.filter((r: any) => r.date <= to);
  }

  if (edoFilter !== "all") {
    filtered = filtered.filter(
      (r: any) => r.edoName === edoFilter
    );
  }

  if (relieverFilter !== "all") {
    filtered = filtered.filter(
      (r: any) => r.relieverCompanyId === relieverFilter
    );
  }

  // =============================
  // SPLIT DATA
  // =============================
  const pending = filtered.filter((r: any) => r.status === "pending");
  const history = filtered.filter((r: any) => r.status !== "pending");

  // =============================
  // APPROVE
  // =============================
  async function handleApprove(id: string) {
    if (!canApprove) return;

    await updateDoc(doc(db, "invoices", id), {
      status: "approved",
      approvedBy: user.name,
      approvedAt: new Date().toISOString(),
    });

    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, status: "approved", approvedBy: user.name }
          : r
      )
    );
  }

  // =============================
  // REJECT
  // =============================
  async function handleReject(id: string) {
    if (!canApprove) return;

    await updateDoc(doc(db, "invoices", id), {
      status: "rejected",
      rejectedBy: user.name,
      rejectedAt: new Date().toISOString(),
    });

    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, status: "rejected", rejectedBy: user.name }
          : r
      )
    );
  }

  // =============================
  // UI
  // =============================
  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            Reliever Invoices Approval
          </h1>
          <p className="text-sm text-muted-foreground">
            Review and approve invoices submitted by relievers.
          </p>
        </div>

        <Button asChild variant="outline" size="sm">
          <Link href="/invoicing/reliever/summary">View Summary</Link>
        </Button>
      </header>

      {/* ================= FILTERS ================= */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">

          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border p-2 rounded"
          />

          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border p-2 rounded"
          />

          <select
            value={edoFilter}
            onChange={(e) => setEdoFilter(e.target.value)}
            className="border p-2 rounded"
          >
            <option value="all">All EDOs</option>
            {[...new Set(rows.map((r) => r.edoName))].map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>

          <select
            value={relieverFilter}
            onChange={(e) => setRelieverFilter(e.target.value)}
            className="border p-2 rounded"
          >
            <option value="all">All Relievers</option>
            {[...new Set(rows.map((r) => r.relieverCompanyId))].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>

        </CardContent>
      </Card>

      {/* ================= PENDING ================= */}
      <Card>
        <CardHeader>
          <CardTitle>Pending Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div>Loading...</div>
          ) : pending.length === 0 ? (
            <div>No pending invoices</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left py-2">Date</th>
                  <th className="text-left py-2">Reliever</th>
                  <th className="text-left py-2">Type</th>
                  <th className="text-left py-2">Company</th>
                  <th className="text-left py-2">Route</th>
                  <th className="text-left py-2">Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pending.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td>{formatDate(r.date)}</td>
                    <td>{r.relieverCompanyId}</td>
                    <td>{labelType(r.reliefType)}</td>
                    <td>{r.edoName}</td>
                    <td>{r.routeCode}</td>
                    <td>R {Number(r.amount).toFixed(2)}</td>
                    <td>
                      {canApprove && (
                        <div className="flex gap-2">
                          <Button onClick={() => handleApprove(r.id)}>
                            Approve
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={() => handleReject(r.id)}
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* ================= HISTORY ================= */}
      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <div>No history</div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="text-left py-2 px-2">Date</th>
                  <th className="text-left py-2 px-2">Reliever</th>
                  <th className="text-left py-2 px-2">Type</th>
                  <th className="text-left py-2 px-2">Route</th>
                  <th className="text-left py-2 px-2">Amount</th>
                  <th className="text-left py-2 px-2">Status</th>
                  <th className="text-left py-2 px-2">Approved By</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-2">{formatDate(r.date)}</td>
                    <td className="py-2 px-2">{r.relieverCompanyId}</td>
                    <td className="py-2 px-2 whitespace-nowrap">
                      {labelType(r.reliefType)}
                    </td>
                    <td className="py-2 px-2">{r.routeCode}</td>
                    <td className="py-2 px-2 font-medium">
                      R {Number(r.amount).toFixed(2)}
                    </td>
                    <td className="py-2 px-2 capitalize">{r.status}</td>
                    <td className="py-2 px-2">
                      {r.approvedBy || r.rejectedBy || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =============================
// HELPERS
// =============================
function labelType(t: string): string {
  switch (t) {
    case "day":
      return "Day Relief";
    case "second_delivery":
      return "Second Delivery";
    case "sunday_ph":
      return "Sunday / Public Holiday";
    default:
      return t;
  }
}

function formatDate(d: string) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString();
}