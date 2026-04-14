"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { db } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";

export default function EdoUploadPage() {
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

      console.log("EDO DATA:", jsonData);
      setRows(jsonData);
    };

    reader.readAsArrayBuffer(file);
  }

  function createId(name: string) {
    return (
      "edo-" +
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
    );
  }

  async function uploadToFirebase() {
    setLoading(true);

    try {
      console.log("🔥 START UPLOAD");

      const createdCompanies = new Set<string>();

      for (const row of rows) {
        const normalizedRow: any = {};

        Object.keys(row).forEach((key) => {
          normalizedRow[key.trim().toLowerCase()] = row[key];
        });

        const site = normalizedRow["site"];

        const name =
          normalizedRow["company name"] ||
          normalizedRow["edo business name"];

        const routeNo =
          normalizedRow["route no"] ||
          normalizedRow["route"];

        const routeDesc =
          normalizedRow["route description"] ||
          normalizedRow["description"] ||
          "";

        // 🔒 VALIDATION
        if (!routeNo) {
          console.log("⛔ Skipping row (no routeNo)");
          continue;
        }

        if (!name) {
          console.log("⛔ Skipping row (no name)");
          continue;
        }

        // 🔥 STANDARD ID
        const companyId = createId(name);

        const cleanSite = site
          ? String(site).trim().toLowerCase()
          : "";

        // =========================
        // 🏢 CREATE COMPANY
        // =========================
        if (!createdCompanies.has(companyId)) {
          await setDoc(doc(db, "companies", companyId), {
            id: companyId,              // 🔥 CRITICAL
            name,
            type: "edo",
            site: cleanSite,
            createdAt: new Date(),      // useful later
          });

          createdCompanies.add(companyId);

          console.log("✅ COMPANY:", companyId);
        }

        // =========================
        // 🚚 CREATE ROUTE
        // =========================
        const routeId = `${companyId}_${routeNo}`;

        await setDoc(doc(db, "routes", routeId), {
          id: routeId,                 // 🔥 ADD ID FIELD
          edoId: companyId,            // 🔥 LINK
          routeNo: String(routeNo).trim(),
          description: routeDesc,
          createdAt: new Date(),
        });

        console.log("➡️ ROUTE:", routeId);
      }

      console.log("✅ UPLOAD DONE");
      alert("EDO upload complete!");
    } catch (err) {
      console.error("❌ ERROR:", err);
      alert("Upload failed");
    }

    setLoading(false);
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