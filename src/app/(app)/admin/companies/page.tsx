"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { db } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";

export default function CompanyUploadPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // 📥 READ EXCEL
  function handleFileUpload(e: any) {
    const file = e.target.files[0];
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

  // 🚀 PUSH TO FIREBASE
  async function uploadToFirebase() {
    setLoading(true);

    try {
      for (const row of rows) {
        const name = row["name"] || row["Name"];
        const type = row["type"] || row["Type"];

        if (!name || !type) continue;

        const id = name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");

        await setDoc(doc(db, "companies", id), {
          name,
          type,
        });

        console.log("Uploaded:", name);
      }

      alert("Upload complete!");
    } catch (err) {
      console.error(err);
      alert("Upload failed");
    }

    setLoading(false);
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
            {loading ? "Uploading..." : "Upload to Firebase"}
          </button>
        </>
      )}
    </div>
  );
}