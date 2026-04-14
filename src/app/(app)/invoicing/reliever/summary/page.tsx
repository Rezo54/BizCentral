"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getCurrentUser } from "@/lib/session";
import NoAccess from "@/components/no-access";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  listAllRelieverInvoices,
  listInvoicesForEdo,
  listInvoicesForRelieverCompany,
} from "@/data/invoicing";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import * as XLSX from "xlsx";

type RelieverInvoice = {
  id: string;
  date: string;

  amount: number;
  rate: number;

  status: "pending" | "approved" | "rejected";
  submittedAt: string;

  relieverUserId: string;
  relieverBusinessName: string;
  relieverCompanyId: string;

  edoId: string;
  edoName: string;

  routeCode?: string;

  reliefType: "day" | "second_delivery" | "sunday_ph";

  approvedBy?: string;
  rejectedBy?: string;

  createdByUid?: string;
};


export default function RelieverSummaryPage() {
  // -----------------------------
  // STATE
  // -----------------------------
  const [user, setUser] = useState<any>(null);
  const [source, setSource] = useState<any[]>([]);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [edoFilter, setEdoFilter] = useState<string>("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [loading, setLoading] = useState(true);
  const [reliefTypeFilter, setReliefTypeFilter] = useState("all");

  const router = useRouter();

  

  // -----------------------------
  // LOAD DATA
  // -----------------------------
  useEffect(() => {
  async function loadData() {
    const u = await getCurrentUser();
    setUser(u);

    // 🔥 FIX: set edoFilter using correct field
    if (u?.userType === "edo") {
      setEdoFilter(u.companyId || u.edoId || ""); 
    }

    let data: any[] = [];

    if (u) {
      if (u.userType === "reliever") {
        data = await listInvoicesForRelieverCompany(u.relieverId || "");
      } else if (u.userType === "edo") {
        data = await listInvoicesForEdo(u.companyId || u.edoId || "");
      } else {
        data = await listAllRelieverInvoices();
      }
    }

    const cleanedData = data.map((r) => ({
      ...r,
      amount:
        typeof r.amount === "string"
          ? Number(r.amount.replace(/[^0-9.-]+/g, ""))
          : r.amount,
    }));

    setSource(cleanedData);
    setLoading(false);
  }

  loadData();
}, []);

  // -----------------------------
  // ROLE FLAGS
  // -----------------------------
  const isReliever = user?.userType === "reliever";
  const isEdo = user?.userType === "edo";
  const isAdmin =
    user?.accessLevel === "admin" ||
    user?.accessLevel === "superadmin";

  // -----------------------------
  // MEMOS (FIXED POSITION)
  // -----------------------------
  const edoOptions = useMemo(() => {
  const map = new Map<string, string>();

  source.forEach((r) => {
    map.set(r.edoId, r.edoName);
  });

  return Array.from(map.entries()); // [id, name]
  }, [source]);

  const supplierOptions = useMemo(() => {
    return Array.from(new Set(source.map((r) => r.relieverCompanyId))).sort();
  }, [source]);

 const filtered = useMemo(() => {
  return source.filter((r) => {

    // 🔒 EDO restriction (PRIMARY)
    if (user?.userType === "edo") {
      if (r.edoId !== user.companyId) return false;
    }

    // 🔒 Reliever restriction
    if (user?.userType === "reliever") {
    if (r.relieverCompanyId !== user.relieverId) return false;
    }

    // Existing filters
    if (from && r.date < from) return false;
    if (to && r.date > to) return false;
    if (edoFilter !== "all" && r.edoId !== edoFilter) return false;
    if (supplierFilter !== "all" && r.relieverCompanyId !== supplierFilter) return false;

    // Status filter
    if (statusFilter !== "all" && r.status !== statusFilter) return false;

    // Relief type filter
    if (reliefTypeFilter !== "all" && r.reliefType !== reliefTypeFilter) return false;

    return true;
  });
}, [
  source,
  from,
  to,
  edoFilter,
  supplierFilter,
  statusFilter,
  reliefTypeFilter,
  user // ✅ IMPORTANT (don’t forget this)
]);

  const pendingRows = filtered.filter((r) => r.status === "pending");
  const approvedRows = filtered.filter((r) => r.status === "approved");
  const rejectedRows = filtered.filter((r) => r.status === "rejected");

  const grandTotal = useMemo(
    () => filtered.reduce((s, r) => s + r.amount, 0),
    [filtered]
  );

  const pendingTotal = useMemo(
    () => pendingRows.reduce((s, r) => s + r.amount, 0),
    [pendingRows]
  );

  const approvedTotal = useMemo(
    () => approvedRows.reduce((s, r) => s + r.amount, 0),
    [approvedRows]
  );

  const rejectedTotal = useMemo(
    () => rejectedRows.reduce((s, r) => s + r.amount, 0),
    [rejectedRows]
  );

  const groupedPending = useMemo(() => groupByReliever(pendingRows), [pendingRows]);
  const groupedApproved = useMemo(() => groupByReliever(approvedRows), [approvedRows]);
  const groupedRejected = useMemo(() => groupByReliever(rejectedRows), [rejectedRows]);

  const printByEdo = useMemo(() => groupByEdo(filtered), [filtered]);
  const printByReliever = useMemo(() => groupByReliever(filtered), [filtered]);

  // -----------------------------
  // GUARDS
  // -----------------------------
  if (loading) return <div className="p-4">Loading...</div>;

  if (!user) return null;

  if (!isAdmin && !isEdo && !isReliever) {
    return <NoAccess hint="You do not have access to this page." />;
  }

  // -----------------------------
  // ACTIONS
  // -----------------------------



function exportExcel() {
  const data = filtered.map((r) => ({
    Date: r.date,
    "Reliever ID": r.relieverCompanyId,
    "EDO Name": r.edoName,
    Route: r.routeCode,
    "Relief Type": labelType(r.reliefType),
    Amount: r.amount, // keep numeric
    Status: r.status,
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Summary");

  XLSX.writeFile(workbook, "reliever-summary.xlsx");
}

  function printPage() {
    window.print();
  }

  console.log("EDO FILTER:", edoFilter);

  // -----------------------------
  // FULL ORIGINAL JSX (UNCHANGED)
  // -----------------------------
  return (
    <div className="flex flex-col h-[calc(100vh-0px)] overflow-auto">
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }

          .print-report,
          .print-report * {
            visibility: visible;
          }

          .print-report {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white;
            color: black;
            padding: 24px;
          }

          .no-print {
            display: none !important;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
          }

          th, td {
            border: 1px solid #ccc;
            padding: 6px 8px;
            text-align: left;
          }

          h1, h2, h3 {
            margin: 0 0 8px 0;
          }

          .print-section {
            margin-top: 20px;
          }

          .print-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
          }

          .print-header {
            display: block;
            margin-bottom: 20px;
          }

          .print-meta {
            text-align: left;
            margin-top: 10px;
          }

          .print-logo {
            display: block;
            margin: 0 auto;
            max-height: 60px;
            width: auto;
            object-fit: contain;
          }

          .page-break {
            break-before: page;
          }

          .page-break:first-child {
            break-before: auto;
          }
        }
      `}</style>

      <div className="no-print space-y-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold">Invoice Summary</h1>
            <p className="text-sm text-muted-foreground">
              History and totals by reliever, with filters and exports.
            </p>
            {/* <br></br>

            <div className="flex justify-between items-center mb-4">                          
              <button
                onClick={() => router.push("/invoicing/reliever")}
                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm"
              >
                ← Back to Invoice Page
              </button>
              </div>  */}

              <h1 className="text-xl font-semibold">Summary</h1> 

                       
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={exportExcel}>
              Export Excel
            </Button>
            <Button onClick={printPage}>
              Print / Save PDF
            </Button>
          </div>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-6 items-end">
           <div>
              <label className="block text-xs mb-1">From</label>
              <Input
                type="date"
                value={from}
                max={new Date().toISOString().split("T")[0]}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs mb-1">To</label>
              <Input
                type="date"
                value={to} // ✅ FIXED
                max={new Date().toISOString().split("T")[0]}
                onChange={(e) => setTo(e.target.value)} // ✅ FIXED
              />
            </div>

            <div>
              <label className="block text-xs mb-1">EDO</label>
              <select
               value={edoFilter}
                onChange={(e) => setEdoFilter(e.target.value)}
                disabled={user?.userType === "edo"} // optional lock
                className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                >
                {/* Only show "All" for non-EDO users */}
                {user?.userType !== "edo" && (
                <option value="all">All</option>
                )}

                {edoOptions.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            {!isReliever && (
              <div>
                <label className="block text-xs mb-1">Supplier / Reliever</label>
                <select
                  className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                  value={supplierFilter}
                  onChange={(e) => setSupplierFilter(e.target.value)}
                >
                  <option value="all">All</option>
                  {supplierOptions.map((supplier) => (
                    <option key={supplier} value={supplier}>
                      {supplier}
                    </option>
                  ))}
                </select>
              </div>              
            )}

            <div>
            <label className="block text-xs mb-1">Status</label>
            <select
              className="w-full rounded-md border px-3 py-2 text-sm bg-background"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div>
              <label className="block text-xs mb-1">Relief Type</label>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                value={reliefTypeFilter}
                onChange={(e) => setReliefTypeFilter(e.target.value)}
              >
                <option value="all">All</option>
                <option value="day">Day Relief</option>
                <option value="sunday_ph">Sunday / Public Holiday</option>
                <option value="second_delivery">Second Delivery</option>
              </select>
            </div>

            <MetricCard label="Grand total" value={grandTotal} />
            <MetricCard label="Approved total" value={approvedTotal} />
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pending Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-semibold">R {pendingTotal.toFixed(2)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Rejected Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-semibold">R {rejectedTotal.toFixed(2)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Invoice Count</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-semibold">{filtered.length}</div>
            </CardContent>
          </Card>
        </div>

        <GroupedRelieverTable title="Totals by Reliever — Pending" rows={groupedPending} />
        <GroupedRelieverTable title="Totals by Reliever — Approved" rows={groupedApproved} />
        <GroupedRelieverTable title="Totals by Reliever — Rejected" rows={groupedRejected} />
      </div>

      <div className="print-report hidden print:block">
        <div className="print-header">
          <div>
            <img src="/logo.png" alt="Taskraft logo" className="print-logo" />
          </div>
          <div className="print-meta">
            <h1>Reliever Summary Report</h1>
            <p>Date range: {from || "Any"} to {to || "Any"}</p>
            <p>EDO:{" "}{edoFilter === "all"? "All": filtered[0]?.edoName || edoFilter}</p>
            <p>Supplier / Reliever: {supplierFilter === "all" ? "All" : supplierFilter}</p>
            <p>Status: {statusFilter === "all" ? "All" : statusFilter}</p>
            <p>Relief Type:{" "}{reliefTypeFilter === "all"? "All": labelType(reliefTypeFilter as RelieverInvoice["reliefType"])}</p>
          </div>
        </div>

        <div className="print-section print-grid">
          <div><strong>Grand total:</strong> R {grandTotal.toFixed(2)}</div>
          <div><strong>Approved total:</strong> R {approvedTotal.toFixed(2)}</div>
          <div><strong>Rejected total:</strong> R {rejectedTotal.toFixed(2)}</div>
          <div><strong>Pending total:</strong> R {pendingTotal.toFixed(2)}</div>
        </div>

        <div className="print-section">
          <h2>Summary by EDO</h2>
          <table>
            <thead>
              <tr>
                <th>EDO</th>
                <th>Count</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {printByEdo.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td>{r.count}</td>
                  <td>R {r.total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="print-section">
          <h2>Summary by Reliever</h2>
          <table>
            <thead>
              <tr>
                <th>Reliever Business</th>
                <th>Count</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {printByReliever.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td>{r.count}</td>
                  <td>R {r.total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="print-section">
          <h2>Detailed Records</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Reliever Business</th>
                <th>EDO Name</th>
                <th>Route</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Approved By</th>
              </tr>
            </thead>
            <tbody>
              {[...filtered].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
              .map((r) => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td>{r.relieverCompanyId}</td>
                  <td>{r.edoName}</td>
                  <td>{r.routeCode}</td>
                  <td>{labelType(r.reliefType)}</td>
                  <td>R {r.amount.toFixed(2)}</td>
                  <td className="capitalize">{r.status}</td>
                  <td className="capitalize">{r.status === "approved"
                       ? r.approvedBy || "-"
                       : r.status === "rejected"
                       ? r.rejectedBy || "-"
                       : "-"}
                    </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="text-sm">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="text-lg font-semibold">R {value.toFixed(2)}</div>
    </div>
  );
}

function GroupedRelieverTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ name: string; count: number; total: number }>;
}) {
  const printStyles = `
@media print {
  body * {
    visibility: hidden;
  }

  .print-report,
  .print-report * {
    visibility: visible;
  }

  .print-report {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    background: white;
    color: black;
    padding: 24px;
  }

  .no-print {
    display: none !important;
  }

  .print-header {
    text-align: center;
    margin-bottom: 20px;
  }

  .print-logo {
    display: block;
    margin: 0 auto 10px auto;
    max-height: 60px;
  }

  .page-break {
    break-before: page;
  }

  .page-break:first-child {
    break-before: auto;
  }
}
`;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">No data in this category.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground border-b">
              <tr>
                <th className="py-2 pr-3">Reliever Business</th>
                <th className="py-2 pr-3">Count</th>
                <th className="py-2 pr-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="border-b last:border-b-0">
                  <td className="py-2 pr-3">{r.name}</td>
                  <td className="py-2 pr-3">{r.count}</td>
                  <td className="py-2 pr-3">R {r.total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function groupByReliever(rows: RelieverInvoice[]) {
  const map = new Map<string, { count: number; total: number }>();

  for (const r of rows) {
    const key = r.relieverBusinessName;
    const prev = map.get(key) ?? { count: 0, total: 0 };
    prev.count += 1;
    prev.total += r.amount;
    map.set(key, prev);
  }

  return Array.from(map, ([name, v]) => ({ name, ...v })).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

function groupByEdo(rows: RelieverInvoice[]) {
  const map = new Map<string, { count: number; total: number }>();

  for (const r of rows) {
    const key = r.edoName;
    const prev = map.get(key) ?? { count: 0, total: 0 };
    prev.count += 1;
    prev.total += r.amount;
    map.set(key, prev);
  }

  return Array.from(map, ([name, v]) => ({ name, ...v })).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

function labelType(t: RelieverInvoice["reliefType"]): string {
  switch (t) {
    case "day":
      return "Day Relief";
    case "second_delivery":
      return "Second Delivery";
    case "sunday_ph":
      return "Sunday / Public Holiday";
  }
}