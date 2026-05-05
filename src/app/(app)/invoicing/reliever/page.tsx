"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { db } from "@/lib/firebase";
import { doc, updateDoc, deleteDoc } from "firebase/firestore";

import { getCurrentUser } from "@/lib/session";
import NoAccess from "@/components/no-access";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";

import Link from "next/link";

import {
  createRelieverInvoice,
  listInvoicesForRelieverCompany,
  getRateFor,
  type ReliefType,
  type RelieverInvoice,
} from "@/data/invoicing";

import { listEdos, listRoutesForEdo } from "@/data/edo-routes";

// =============================
// SCHEMA
// =============================
const formSchema = z.object({
  date: z.string().min(1, "Select a date"),
  edoId: z.string().min(1, "Select an EDO"),
  routeCode: z.string().min(1, "Select a route"),
  reliefType: z.enum(["day", "second_delivery", "sunday_ph"]),
});

type FormValues = z.infer<typeof formSchema>;

export default function RelieverInvoicingPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [edos, setEdos] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [rows, setRows] = useState<RelieverInvoice[]>([]);

  // FILTERS
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [edoFilter, setEdoFilter] = useState("all");

  // EDIT MODAL
  const [editing, setEditing] = useState<RelieverInvoice | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editType, setEditType] = useState<ReliefType>("day");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      date: "",
      edoId: "",
      routeCode: "",
      reliefType: "day",
    },
  });

  const selectedEdoId = form.watch("edoId");
  const selectedType = form.watch("reliefType");

  // =============================
  // LOAD USER
  // =============================
  useEffect(() => {
    async function loadUser() {
      const u = await getCurrentUser();
      setUser(u);
      setLoading(false);
    }
    loadUser();
  }, []);

  // LOAD EDOS
  useEffect(() => {
    async function loadEdos() {
      try {
        const data = await listEdos();
        setEdos(data || []);
      } catch {
        setEdos([]);
      }
    }
    loadEdos();
  }, []);

  // LOAD ROUTES
  useEffect(() => {
    async function loadRoutes() {
      if (!selectedEdoId) return setRoutes([]);
      const data = await listRoutesForEdo(selectedEdoId);
      setRoutes(data || []);
    }
    loadRoutes();
  }, [selectedEdoId]);

  useEffect(() => {
    form.setValue("routeCode", "");
  }, [selectedEdoId]);

  // LOAD INVOICES
  useEffect(() => {
    async function loadInvoices() {
      if (!user?.relieverId) return;
      const data = await listInvoicesForRelieverCompany(user.relieverId);
      setRows(data || []);
    }
    loadInvoices();
  }, [user]);

  if (loading) return <div className="p-6">Loading...</div>;
  if (!user) return <div className="p-6">User not found</div>;

  if (user.userType !== "reliever") {
    return <NoAccess hint="Reliever access only" />;
  }

  // =============================
  // FILTER LOGIC
  // =============================
  let filtered = [...rows];

  if (from) filtered = filtered.filter((r) => r.date >= from);
  if (to) filtered = filtered.filter((r) => r.date <= to);
  if (edoFilter !== "all") {
    filtered = filtered.filter((r) => r.edoName === edoFilter);
  }

  const pending = filtered.filter((r) => r.status === "pending");
  const approved = filtered.filter((r) => r.status === "approved");
  const rejected = filtered.filter((r) => r.status === "rejected");

  const currentRate = getRateFor(selectedType as ReliefType);

  // =============================
  // SUBMIT
  // =============================
  async function onSubmit(values: FormValues) {
    const edo = edos.find((e) => e.id === values.edoId);
    const route = routes.find((r) => r.code === values.routeCode);

    if (!edo || !route) return;

    const invoice = await createRelieverInvoice({
      relieverUserId: user.uid,
      relieverBusinessName: user.name,
      relieverCompanyId: user.relieverId,
      edoId: edo.id,
      edoName: edo.name,
      date: values.date,
      routeCode: route.code,
      reliefType: values.reliefType,
    });

    setRows((prev) => [invoice, ...prev]);
  }

  // =============================
  // UPDATE
  // =============================
  async function handleUpdate() {
    if (!editing) return;

    await updateDoc(doc(db, "invoices", editing.id), {
      date: editDate,
      reliefType: editType,
    });

    setRows((prev) =>
      prev.map((r) =>
        r.id === editing.id
          ? { ...r, date: editDate, reliefType: editType }
          : r
      )
    );

    setEditing(null);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete invoice?")) return;

    await deleteDoc(doc(db, "invoices", id));
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  // =============================
  // UI
  // =============================
  return (
    <div className="space-y-6 p-4">

      <header className="flex justify-between items-center">
        <h1 className="text-xl font-semibold">Reliever Invoicing</h1>
        <Button asChild variant="outline">
          <Link href="/invoicing/reliever/summary">Summary</Link>
        </Button>
      </header>

      {/* FILTERS */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 grid-cols-1 md:grid-cols-3">

          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border p-2 rounded" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border p-2 rounded" />

          <select value={edoFilter} onChange={(e) => setEdoFilter(e.target.value)} className="border p-2 rounded">
            <option value="all">All EDOs</option>
            {[...new Set(rows.map((r) => r.edoName))]
              .sort((a, b) => a.localeCompare(b))
              .map((e) => (
                <option key={e}>{e}</option>
              ))}
          </select>

        </CardContent>
      </Card>

      {/* FORM */}
      <Card>
        <CardHeader>
          <CardTitle>New Relief Invoice</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid gap-4 grid-cols-1 md:grid-cols-5"
          >

            {/* DATE */}
            <div className="flex flex-col">
              <label className="text-xs font-medium mb-1">Select date</label>
              <input
                type="date"
                max={new Date().toISOString().split("T")[0]}
                className="w-full rounded-md border px-3 py-2 text-sm"
                {...form.register("date")}
              />
            </div>

            {/* EDO */}
            <div className="flex flex-col">
              <label className="text-xs font-medium mb-1">Select EDO</label>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                {...form.register("edoId")}
              >
                <option value="">Choose EDO</option>
                {edos.map((edo) => (
                  <option key={edo.id} value={edo.id}>
                    {edo.name}
                  </option>
                ))}
              </select>
            </div>

            {/* ROUTE */}
            <div className="flex flex-col">
              <label className="text-xs font-medium mb-1">Select route</label>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                {...form.register("routeCode")}
                disabled={!selectedEdoId}
              >
                <option value="">
                  {selectedEdoId ? "Choose route" : "Select EDO first"}
                </option>
                {routes.map((route) => (
                  <option key={route.id} value={route.code}>
                    {route.code} - {route.description}
                  </option>
                ))}
              </select>
            </div>

            {/* TYPE */}
            <div className="flex flex-col">
              <label className="text-xs font-medium mb-1">Type of relief</label>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                {...form.register("reliefType")}
              >
                <option value="day">Day Relief</option>
                <option value="second_delivery">Second Delivery</option>
                <option value="sunday_ph">Sunday / Public Holiday</option>
              </select>
            </div>

            {/* RATE */}
            <div className="flex flex-col justify-end">
              <div className="text-xs text-muted-foreground">Rate</div>
              <div className="text-lg font-semibold">
                R {currentRate.toFixed(2)}
              </div>

              <Button type="submit" className="mt-2 w-full">
                Submit
              </Button>
            </div>

          </form>
        </CardContent>
      </Card>

      {/* SUMMARY */}
      <div className="grid gap-4 lg:grid-cols-3">
        <SummaryCard
          title="Pending"
          rows={pending}
          onEdit={(r: any) => {
            setEditing(r);
            setEditDate(r.date);
            setEditType(r.reliefType);
          }}
          onDelete={handleDelete}
        />
        <SummaryCard title="Approved" rows={approved} />
        <SummaryCard title="Rejected" rows={rejected} />
      </div>

      {/* EDIT MODAL */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg w-80 space-y-3">

            <h2 className="font-semibold">Edit Invoice</h2>

            <input
              type="date"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              className="w-full border p-2 rounded"
            />

            <select
              value={editType}
              onChange={(e) => setEditType(e.target.value as ReliefType)}
              className="w-full border p-2 rounded"
            >
              <option value="day">Day Relief</option>
              <option value="second_delivery">Second Delivery</option>
              <option value="sunday_ph">Sunday / Public Holiday</option>
            </select>

            <div className="flex gap-2">
              <Button onClick={handleUpdate}>Save</Button>
              <Button variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

// =============================
// SUMMARY CARD
// =============================
function SummaryCard({ title, rows, onEdit, onDelete }: any) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No items
          </div>
        ) : (
          rows.map((r: any) => (
            <div key={r.id} className="flex justify-between items-center border-b py-2">

              <div>
                {r.date} · {r.routeCode}
                <div className="text-xs text-muted-foreground">
                  {r.edoName}
                </div>
              </div>

              <div className="flex gap-2 items-center">
                R {r.amount.toFixed(2)}

                {title === "Pending" && (
                  <>
                    <Button size="sm" onClick={() => onEdit(r)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => onDelete(r.id)}
                    >
                      Delete
                    </Button>
                  </>
                )}

              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}