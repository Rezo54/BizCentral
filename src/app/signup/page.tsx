// src/app/signup/page.tsx
"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { useRouter } from "next/navigation";

type SignupCompany = {
  id: string;
  name: string;
  type: "edo" | "reliever";
  active: boolean;
  sourceId: string;
};

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [signupCompanies, setSignupCompanies] = useState<SignupCompany[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingSignupData, setLoadingSignupData] = useState(true);
  const [signupDataError, setSignupDataError] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  useEffect(() => {
    async function loadSignupCompanies() {
      try {
        setLoadingSignupData(true);
        setSignupDataError("");
        const snapshot = await getDocs(collection(db, "signupCompanies"));
        const data = snapshot.docs
          .map((document) => {
            const company = document.data();
            return {
              id: document.id,
              name: String(company.name || "").trim(),
              type: String(company.type || "").trim().toLowerCase(),
              active: company.active === true,
              sourceId: String(company.sourceId || "").trim(),
            };
          })
          .filter(
            (company) =>
              company.active &&
              company.name &&
              company.sourceId &&
              (company.type === "edo" || company.type === "reliever")
          )
          .sort((a, b) => a.name.localeCompare(b.name)) as SignupCompany[];
        setSignupCompanies(data);
      } catch (error) {
        console.error("Unable to load signup companies:", error);
        setSignupCompanies([]);
        setSignupDataError("Unable to load registration companies. Please refresh the page.");
      } finally {
        setLoadingSignupData(false);
      }
    }
    loadSignupCompanies();
  }, []);

  const edoCompanies = signupCompanies.filter((company) => company.type === "edo");
  const relieverCompanies = signupCompanies.filter((company) => company.type === "reliever");
  const selectedCompany = signupCompanies.find((company) => company.id === selectedId);

  async function handleSignup() {
    if (!acceptedTerms) {
      alert("You must accept the Terms & Conditions (POPIA)");
      return;
    }
    if (password !== confirmPassword) {
      alert("Passwords do not match");
      return;
    }
    if (!name.trim() || !type || !email.trim() || !password) {
      alert("Please complete all required fields");
      return;
    }
    if (type !== "taskraft" && !selectedId) {
      alert(type === "edo" ? "Please select an EDO company" : "Please select a Reliever company");
      return;
    }
    if (type !== "taskraft" && !selectedCompany) {
      alert("The selected company could not be found. Please select it again.");
      return;
    }
    if (type === "edo" && selectedCompany?.type !== "edo") {
      alert("The selected company is not a valid EDO.");
      return;
    }
    if (type === "reliever" && selectedCompany?.type !== "reliever") {
      alert("The selected company is not a valid Reliever.");
      return;
    }

    try {
      setLoading(true);
      const normalizedEmail = email.trim().toLowerCase();

      // The browser creates identity only. It does not write /users or /userAccess
      // and it does not assign admin/power_user/standard authorization.
      const userCred = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
      const token = await userCred.user.getIdToken(true);

      const response = await fetch("/api/signup", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          email: normalizedEmail,
          userType: type,
          signupCompanyId: type === "taskraft" ? null : selectedId,
        }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.ok !== true) {
        // Do not leave a newly registered identity signed into the browser when
        // its BizCentral pending-request creation failed.
        await signOut(auth).catch(() => undefined);
        throw new Error(String(body?.error || "Unable to create BizCentral signup request"));
      }

      await signOut(auth);
      alert("Account created successfully. Await admin approval.");
      router.push("/");
    } catch (error: any) {
      console.error("Signup error:", error);
      await signOut(auth).catch(() => undefined);
      alert(error?.message || "Unable to create account.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full lg:grid lg:min-h-screen lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-center items-center bg-[#0b1b3f] text-white p-10">
        <img src="/logo.png" alt="Taskraft Logo" className="w-40 mb-6" />
        <p className="text-sm text-gray-300 text-center max-w-xs">
          Build. Track. Scale your operations with precision.
        </p>
      </div>

      <div className="flex items-center justify-center py-12 bg-gray-50">
        <div className="w-full max-w-md bg-white shadow-lg rounded-xl p-6 space-y-4">
          <h1 className="text-2xl font-semibold text-center">Create Account</h1>

          {signupDataError && (
            <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {signupDataError}
            </div>
          )}

          <input
            placeholder="Name and Surname"
            className="w-full border px-3 py-2 rounded"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

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

          {type === "edo" && (
            <select
              className="w-full border px-3 py-2 rounded"
              value={selectedId}
              disabled={loadingSignupData}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              <option value="">
                {loadingSignupData
                  ? "Loading EDO companies..."
                  : edoCompanies.length === 0
                  ? "No EDO companies available"
                  : "Select EDO"}
              </option>
              {edoCompanies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
          )}

          {type === "reliever" && (
            <select
              className="w-full border px-3 py-2 rounded"
              value={selectedId}
              disabled={loadingSignupData}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              <option value="">
                {loadingSignupData
                  ? "Loading Reliever companies..."
                  : relieverCompanies.length === 0
                  ? "No Reliever companies available"
                  : "Select Reliever"}
              </option>
              {relieverCompanies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
          )}

          <input
            type="email"
            placeholder="Email"
            className="w-full border px-3 py-2 rounded"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="Password"
            className="w-full border px-3 py-2 rounded"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

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
              <a href="/terms" className="text-blue-600 underline">Terms & Conditions (POPIA)</a>
            </span>
          </div>

          <button
            type="button"
            onClick={handleSignup}
            disabled={loading || !acceptedTerms || loadingSignupData}
            className={`w-full py-2 rounded text-white ${
              acceptedTerms && !loadingSignupData
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-gray-400"
            }`}
          >
            {loading ? "Creating..." : "Create Account"}
          </button>

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
