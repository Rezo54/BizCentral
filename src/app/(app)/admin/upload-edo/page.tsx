"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { auth } from "@/lib/firebase";

export default function EdoUploadPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  function handleFileUpload(e: any) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt: any) => {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      setRows(XLSX.utils.sheet_to_json(sheet));
    };
    reader.readAsArrayBuffer(file);
  }

  async function uploadToFirebase() {
    setLoading(true);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Please sign in again.");

      const normalizedRows = rows.map((row) => {
        const normalized: Record<string, unknown> = {};
        Object.keys(row).forEach((key) => {
          normalized[key.trim().toLowerCase()] = row[key];
        });

        return {
          site: normalized["site"],
          companyName: normalized["company name"],
          edoBusinessName: normalized["edo business name"],
          routeNo: normalized["route no"],
          route: normalized["route"],
          routeDescription: normalized["route description"],
          description: normalized["description"],
        };
      });

      const token = await user.getIdToken();
      const response = await fetch("/api/admin/master-data/edo-import", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rows: normalizedRows }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Upload failed");
      }

      alert(
        `EDO upload complete! ${result.companies} companies, ${result.routes} routes` +
          (result.skipped ? `, ${result.skipped} rows skipped.` : ".")
      );
    } catch (err) {
      console.error("EDO upload failed:", err);
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Upload EDO Data</h1>

      <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} />

      {rows.length > 0 && (
        <>
          <div>Loaded {rows.length} rows</div>

          <button
            onClick={uploadToFirebase}
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            {loading ? "Uploading..." : "Upload EDOs"}
          </button>
        </>
      )}
    </div>
  );
}
