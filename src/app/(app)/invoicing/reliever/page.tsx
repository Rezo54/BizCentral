//src/app/(app)/invoicing/page.tsx

"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

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
  // =============================
  // STATE
  // =============================
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [edos, setEdos] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [rows, setRows] = useState<RelieverInvoice[]>([]);

  // =============================
  // FORM
  // =============================
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

  // =============================
  // LOAD EDOS
  // =============================
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

  // =============================
  // LOAD ROUTES
  // =============================
  useEffect(() => {
    async function loadRoutes() {
      if (!selectedEdoId) {
        setRoutes([]);
        return;
      }

      try {
        const data = await listRoutesForEdo(selectedEdoId);
        setRoutes(data || []);
      } catch {
        setRoutes([]);
      }
    }

    loadRoutes();
  }, [selectedEdoId]);

  // reset route when edo changes
  useEffect(() => {
    form.setValue("routeCode", "");
  }, [selectedEdoId]);

  // =============================
  // LOAD INVOICES
  // =============================
  useEffect(() => {
    async function loadInvoices() {
      if (!user?.relieverId) return;

      try {
        const data = await listInvoicesForRelieverCompany(user.relieverId);
        setRows(data || []);
      } catch {
        setRows([]);
      }
    }

    loadInvoices();
  }, [user]);

  // =============================
  // ACCESS CONTROL
  // =============================
  if (loading) return <div className="p-6">Loading...</div>;
  if (!user) return <div className="p-6">User not found</div>;

  const isReliever =
    user.userType === "reliever" ||
    user.role === "client_employee" ||
    user.role === "supplier";

  if (!isReliever) {
    return <NoAccess hint="Reliever access only" />;
  }

  if (!user.relieverId) {
    return <div className="p-6 text-red-600">Reliever not linked</div>;
  }

  // =============================
  // RATE
  // =============================
  const currentRate = getRateFor(
    (selectedType || "day") as ReliefType
  );

  // =============================
  // SUBMIT
  // =============================
  async function onSubmit(values: FormValues) {
    const edo = edos.find((e) => e.id === values.edoId);
    const route = routes.find((r) => r.code === values.routeCode);

    if (!edo || !route) {
      alert("Invalid selection");
      return;
    }
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

    form.reset({
      date: "",
      edoId: values.edoId,
      routeCode: "",
      reliefType: values.reliefType,
    });
  }

  const pending = rows.filter((r) => r.status === "pending");
  const approved = rows.filter((r) => r.status === "approved");
  const rejected = rows.filter((r) => r.status === "rejected");

  // =============================
  // UI (YOUR ORIGINAL FORMAT)
  // =============================
  return (
    <div className="space-y-6">
     <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">
            Reliever Invoicing
          </h1>
          <p className="text-sm text-muted-foreground">
            Capture your daily relief work and track approvals from EDOs.
          </p>
        </div>

        <Button asChild variant="outline" size="sm">
          <Link href="/invoicing/reliever/summary">View Summary</Link>
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New Relief Invoice</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid gap-3 md:grid-cols-5 items-start"
          >
            <div>
              <label className="block text-xs mb-1">Select date</label>
              <input
                type="date"
                max={new Date().toISOString().split("T")[0]}
                className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                {...form.register("date")}
              />
              <p className="text-xs text-destructive">
                {form.formState.errors.date?.message}
              </p>
            </div>

            <div>
              <label className="block text-xs mb-1">Select EDO</label>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                {...form.register("edoId")}
              >
                <option value="">Choose EDO</option>
                {edos.map((edo) => (
                  <option key={edo.id} value={edo.id}>
                    {edo.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-destructive">
                {form.formState.errors.edoId?.message}
              </p>
            </div>

            <div>
              <label className="block text-xs mb-1">Select route</label>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm bg-background"
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
              <p className="text-xs text-muted-foreground">
                Routes are filtered by the selected EDO.
              </p>
            </div>

            <div>
              <label className="block text-xs mb-1">Type of relief</label>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                {...form.register("reliefType")}
              >
                <option value="day">Day Relief</option>
                <option value="second_delivery">Second Delivery</option>
                <option value="sunday_ph">Sunday / Public Holiday</option>
              </select>
            </div>

            <div>
              <div className="text-xs mb-1 text-muted-foreground">
                Rate for selection
              </div>
              <div className="text-lg font-semibold">
                R {currentRate.toFixed(2)}
              </div>
              <Button type="submit" className="mt-2 w-full">
                Submit for Approval
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <SummaryCard title="Pending" rows={pending} />
        <SummaryCard title="Approved" rows={approved} />
        <SummaryCard title="Rejected" rows={rejected} />
      </div>
    </div>
  );
}

// =============================
// SUMMARY CARD
// =============================
function SummaryCard({
  title,
  rows,
}: {
  title: string;
  rows: RelieverInvoice[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="max-h-80 overflow-y-auto text-sm">
        {rows.length === 0 ? (
          <div className="text-muted-foreground">
            No {title.toLowerCase()} items.
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="flex justify-between gap-2">
                <div>
                  <div className="font-medium">
                    {r.date} · {r.routeCode}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {labelType(r.reliefType)} · {r.edoName}
                  </div>
                </div>
                <div className="font-semibold">
                  R {r.amount.toFixed(2)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function labelType(t: ReliefType): string {
  switch (t) {
    case "day":
      return "Day Relief";
    case "second_delivery":
      return "Second Delivery";
    case "sunday_ph":
      return "Sunday / Public Holiday";
  }
}