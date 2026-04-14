"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { db } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";

export default function RelieverUploadPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  function handleFileUpload(e: any) {
    const file = e.target.files[0];
    const reader = new FileReader();

    reader.onload = (evt: any) => {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: "array" });

      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(sheet);

      console.log("RELIEVER DATA:", jsonData);
      setRows(jsonData);
    };

    reader.readAsArrayBuffer(file);
  }

  function createRelieverId(name: string, phone: string) {
    const cleanPhone = String(phone || "").replace(/\D/g, "");

    return (
      "rel-" +
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") +
      "-" +
      cleanPhone
    );
  }

  async function uploadToFirebase() {
    setLoading(true);

    try {
      console.log("🔥 START RELIEVER UPLOAD");

      for (const row of rows) {
        const normalized: any = {};

        Object.keys(row).forEach((key) => {
          normalized[key.trim().toLowerCase()] = row[key];
        });

        const site = normalized["site"];
        const name = normalized["reliever name"];
        const businessName = normalized["business name"];

        const cellphone =
          normalized["cellphone"] ||
          normalized["cellphone number"] ||
          normalized["phone"] ||
          normalized["mobile"];

        if (!name) {
          console.log("⛔ Skipping (no reliever name)");
          continue;
        }

        if (!cellphone) {
          console.log("⛔ Skipping (no cellphone)");
          continue;
        }

        const cleanCellphone = String(cellphone).replace(/\D/g, "");

        const relieverId = createRelieverId(name, cleanCellphone);

        // =========================
        // 👤 CREATE RELIEVER
        // =========================
        await setDoc(doc(db, "relievers", relieverId), {
          id: relieverId,           // 🔥 CRITICAL
          relieverId,
          name,
          cellphone: cleanCellphone,
          businessName: businessName || "",
          site: site || "",
          createdAt: new Date(),
        });

        console.log("✅ Reliever saved:", relieverId);
      }

      console.log("✅ RELIEVER UPLOAD DONE");
      alert("Reliever upload complete!");
    } catch (err) {
      console.error("❌ ERROR:", err);
      alert("Upload failed");
    }

    setLoading(false);
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Upload Relievers</h1>

      <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} />

      {rows.length > 0 && (
        <>
          <div>Loaded {rows.length} rows</div>

          <button
            onClick={uploadToFirebase}
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            {loading ? "Uploading..." : "Upload Relievers"}
          </button>
        </>
      )}
    </div>
  );
}