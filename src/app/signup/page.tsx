"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, addDoc } from "firebase/firestore";
import { createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const auth = getAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [selectedId, setSelectedId] = useState("");

  const [companies, setCompanies] = useState<any[]>([]);
  const [relievers, setRelievers] = useState<any[]>([]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);

  const [acceptedTerms, setAcceptedTerms] = useState(false);

  useEffect(() => {
    async function loadData() {
      const edoSnap = await getDocs(collection(db, "companies"));
      const relSnap = await getDocs(collection(db, "relievers"));

      setCompanies(
        edoSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((c: any) => c.type === "edo")
      );

      setRelievers(relSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }

    loadData();
  }, []);

  async function handleSignup() {
    if (!acceptedTerms) {
  alert("You must accept the Terms & Conditions (POPIA)");
  return;
  }
    if (password !== confirmPassword) {
      alert("Passwords do not match");
      return;
    }

    if (!name || !type || !email || !password) {
      alert("Please complete all required fields");
      return;
    }

    if (type !== "taskraft" && !selectedId) {
      alert("Please select a company/reliever");
      return;
    }

    try {
      setLoading(true);

      const userCred = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      let accessLevel = "standard";
      if (type === "edo") accessLevel = "power_user";
      if (type === "taskraft") accessLevel = "admin";

      const userData: any = {
        uid: userCred.user.uid,
        name,
        email,
        userType: type,
        role: "pending",
        status: "pending",
        accessLevel,
        createdAt: new Date().toISOString(),
      };

      // EDO
      if (type === "edo") {
        const selectedCompany = companies.find((c) => c.id === selectedId);
        userData.companyId = selectedId;
        userData.businessName = selectedCompany?.name || "";
      }

      // RELIEVER
      if (type === "reliever") {
        const selectedReliever = relievers.find((r) => r.id === selectedId);
        userData.relieverId = selectedId;
        userData.businessName =
          selectedReliever?.businessName || selectedReliever?.name || "";
      }

      await addDoc(collection(db, "users"), userData);

      alert("Account created. Await admin approval.");

      // ✅ redirect to login
      router.push("/");
    } catch (err: any) {
      console.error(err);
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full lg:grid lg:min-h-screen lg:grid-cols-2">

      {/* 🔵 LEFT PANEL (VISIBLE ON DESKTOP) */}
      <div className="hidden lg:flex flex-col justify-center items-center bg-[#0b1b3f] text-white p-10">
        
        {/* LOGO */}
        <img
          src="/logo.png"
          alt="Taskraft Logo"
          className="w-40 mb-6"
        />        
        <p className="text-sm text-gray-300 text-center max-w-xs">
          Build. Track. Scale your operations with precision.
        </p>
      </div>

      {/* ⚪ RIGHT PANEL (FORM) */}
      <div className="flex items-center justify-center py-12 bg-gray-50">
        <div className="w-full max-w-md bg-white shadow-lg rounded-xl p-6 space-y-4">

          <h1 className="text-2xl font-semibold text-center">
            Create Account
          </h1>

          {/* Name */}
          <input
            placeholder="Name and Surname"
            className="w-full border px-3 py-2 rounded"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          {/* User Type */}
          <select
            className="w-full border px-3 py-2 rounded"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setSelectedId("");
            }}
          >
            <option value="">Select User Type</option>
            <option value="taskraft">Taskraft</option>
            <option value="edo">EDO</option>
            <option value="reliever">Reliever</option>
          </select>

          {/* EDO */}
          {type === "edo" && (
            <select
              className="w-full border px-3 py-2 rounded"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              <option value="">Select EDO</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          {/* Reliever */}
          {type === "reliever" && (
            <select
              className="w-full border px-3 py-2 rounded"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              <option value="">Select Reliever</option>
              {relievers.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.businessName || r.name}
                </option>
              ))}
            </select>
          )}

          {/* Email */}
          <input
            placeholder="Email"
            className="w-full border px-3 py-2 rounded"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          {/* Password */}
          <input
            type="password"
            placeholder="Password"
            className="w-full border px-3 py-2 rounded"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {/* Confirm Password */}
          <input
            type="password"
            placeholder="Confirm Password"
            className="w-full border px-3 py-2 rounded"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />

          <div className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-1"
            />

            <span>
              I agree to the{" "}
              <a
                href="/terms"
                target="_blank"
                className="text-blue-600 underline"
              >
                Terms & Conditions (POPIA)
              </a>
            </span>
          </div>

          {/* Submit */}
          <button
            onClick={handleSignup}
            disabled={loading || !acceptedTerms}
            className={`w-full py-2 rounded text-white ${
              acceptedTerms ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-400"
            }`}
          >
            {loading ? "Creating..." : "Create Account"}
          </button>

          {/* Back to Login */}
          <p
            onClick={() => router.push("/")}
            className="text-sm text-center text-blue-600 cursor-pointer"
          >
            Back to Login
          </p>

        </div>
      </div>
    </div>
  );
}