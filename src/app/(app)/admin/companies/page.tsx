"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { auth } from "@/lib/firebase";

export default function CompanyUploadPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // 📥 READ EXCEL
  function handleFileUpload(e: any) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();

    reader.onload = (evt: any) => {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: "array" });

      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(sheet);

      console.log("Excel Data:", jsonData);
      setRows(jsonData);
    };

    reader.readAsArrayBuffer(file);
  }

  // 🚀 SEND TO PROTECTED ADMIN API
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
          name: normalized["name"],
          type: normalized["type"],
        };
      });

      const token = await user.getIdToken();
      const response = await fetch("/api/admin/master-data/company-import", {
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
        `Company upload complete! ${result.companies} companies` +
          (result.skipped ? `, ${result.skipped} rows skipped.` : ".")
      );
    } catch (err) {
      console.error("Company upload failed:", err);
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Upload Companies (Excel)</h1>

      <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} />

      {rows.length > 0 && (
        <>
          <div className="text-sm text-muted-foreground">
            Loaded {rows.length} rows
          </div>

          <button
            onClick={uploadToFirebase}
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            {loading ? "Uploading..." : "Upload Companies"}
          </button>
        </>
      )}
    </div>
  );
}
