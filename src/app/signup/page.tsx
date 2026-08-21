// src/app/signup/page.tsx

"use client";

import { useEffect, useState } from "react";

import { db } from "@/lib/firebase";

import {
  addDoc,
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import {
  createUserWithEmailAndPassword,
  getAuth,
} from "firebase/auth";

import { useRouter } from "next/navigation";

/* =========================================================
   TYPES
========================================================= */

type SignupCompany = {
  id: string;
  name: string;
  type: "edo" | "reliever";
  active: boolean;
  sourceId: string;
};

/* =========================================================
   PAGE
========================================================= */

export default function SignupPage() {
  const auth = getAuth();
  const router = useRouter();

  const [name, setName] =
    useState("");

  const [type, setType] =
    useState("");

  const [
    selectedId,
    setSelectedId,
  ] = useState("");

  const [
    signupCompanies,
    setSignupCompanies,
  ] = useState<SignupCompany[]>([]);

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState("");

  const [loading, setLoading] =
    useState(false);

  const [
    loadingSignupData,
    setLoadingSignupData,
  ] = useState(true);

  const [
    signupDataError,
    setSignupDataError,
  ] = useState("");

  const [
    acceptedTerms,
    setAcceptedTerms,
  ] = useState(false);

  /* =======================================================
     LOAD PUBLIC SIGNUP DIRECTORY

     This page deliberately does NOT read:

     /companies
     /relievers

     It reads only:

     /signupCompanies

     Public records contain:

     name
     type
     active
     sourceId
     updatedAt
  ======================================================= */

  useEffect(() => {
    async function loadSignupCompanies() {
      try {
        setLoadingSignupData(true);
        setSignupDataError("");

        const snapshot =
          await getDocs(
            collection(
              db,
              "signupCompanies"
            )
          );

        const data =
          snapshot.docs
            .map((document) => {
              const company =
                document.data();

              return {
                id:
                  document.id,

                name:
                  String(
                    company.name || ""
                  ).trim(),

                type:
                  String(
                    company.type || ""
                  )
                    .trim()
                    .toLowerCase(),

                active:
                  company.active === true,

                sourceId:
                  String(
                    company.sourceId || ""
                  ).trim(),
              };
            })
            .filter(
              (company) =>
                company.active &&
                company.name &&
                company.sourceId &&
                (
                  company.type === "edo" ||
                  company.type === "reliever"
                )
            )
            .sort(
              (a, b) =>
                a.name.localeCompare(
                  b.name
                )
            ) as SignupCompany[];

        setSignupCompanies(
          data
        );

      } catch (error) {
        console.error(
          "Unable to load signup companies:",
          error
        );

        setSignupCompanies([]);

        setSignupDataError(
          "Unable to load registration companies. Please refresh the page."
        );

      } finally {
        setLoadingSignupData(
          false
        );
      }
    }

    loadSignupCompanies();

  }, []);

  /* =======================================================
     EDO DIRECTORY
  ======================================================= */

  const edoCompanies =
    signupCompanies.filter(
      (company) =>
        company.type === "edo"
    );

  /* =======================================================
     RELIEVER DIRECTORY
  ======================================================= */

  const relieverCompanies =
    signupCompanies.filter(
      (company) =>
        company.type ===
        "reliever"
    );

  /* =======================================================
     SELECTED COMPANY
  ======================================================= */

  const selectedCompany =
    signupCompanies.find(
      (company) =>
        company.id ===
        selectedId
    );

  /* =======================================================
     SIGNUP
  ======================================================= */

  async function handleSignup() {
    /* ---------------------------------------------------
       TERMS
    --------------------------------------------------- */

    if (!acceptedTerms) {
      alert(
        "You must accept the Terms & Conditions (POPIA)"
      );

      return;
    }

    /* ---------------------------------------------------
       PASSWORD
    --------------------------------------------------- */

    if (
      password !==
      confirmPassword
    ) {
      alert(
        "Passwords do not match"
      );

      return;
    }

    /* ---------------------------------------------------
       REQUIRED FIELDS
    --------------------------------------------------- */

    if (
      !name.trim() ||
      !type ||
      !email.trim() ||
      !password
    ) {
      alert(
        "Please complete all required fields"
      );

      return;
    }

    /* ---------------------------------------------------
       COMPANY SELECTION
    --------------------------------------------------- */

    if (
      type !== "taskraft" &&
      !selectedId
    ) {
      alert(
        type === "edo"
          ? "Please select an EDO company"
          : "Please select a Reliever company"
      );

      return;
    }

    /* ---------------------------------------------------
       VERIFY DIRECTORY RECORD
    --------------------------------------------------- */

    if (
      type !== "taskraft" &&
      !selectedCompany
    ) {
      alert(
        "The selected company could not be found. Please select it again."
      );

      return;
    }

    /* ---------------------------------------------------
       VERIFY COMPANY TYPE
    --------------------------------------------------- */

    if (
      type === "edo" &&
      selectedCompany?.type !== "edo"
    ) {
      alert(
        "The selected company is not a valid EDO."
      );

      return;
    }

    if (
      type === "reliever" &&
      selectedCompany?.type !== "reliever"
    ) {
      alert(
        "The selected company is not a valid Reliever."
      );

      return;
    }

    try {
      setLoading(true);

      /* =================================================
         1. CREATE FIREBASE AUTHENTICATION USER
      ================================================= */

      const userCred =
        await createUserWithEmailAndPassword(
          auth,
          email
            .trim()
            .toLowerCase(),
          password
        );

      const uid =
        userCred.user.uid;

      /* =================================================
         2. REQUESTED ACCESS LEVEL

         This is stored in /users for admin review.

         It does NOT activate the user's authorization.
      ================================================= */

      let requestedAccessLevel =
        "standard";

      if (type === "edo") {
        requestedAccessLevel =
          "power_user";
      }

      if (
        type === "taskraft"
      ) {
        requestedAccessLevel =
          "admin";
      }

      /* =================================================
         3. BUILD USER PROFILE
      ================================================= */

      const userData: any = {
        uid,

        name:
          name.trim(),

        email:
          email
            .trim()
            .toLowerCase(),

        userType:
          type,

        role:
          "pending",

        status:
          "pending",

        accessLevel:
          requestedAccessLevel,

        createdAt:
          new Date()
            .toISOString(),
      };

      /* =================================================
         4. EDO RELATIONSHIP

         IMPORTANT:

         We use sourceId, NOT the public
         signupCompanies document ID.

         sourceId points to the actual company.
      ================================================= */

      if (
        type === "edo" &&
        selectedCompany
      ) {
        userData.companyId =
          selectedCompany.sourceId;

        userData.businessName =
          selectedCompany.name;
      }

      /* =================================================
         5. RELIEVER RELATIONSHIP

         sourceId points to the actual document in:

         /relievers/{sourceId}
      ================================================= */

      if (
        type === "reliever" &&
        selectedCompany
      ) {
        userData.relieverId =
          selectedCompany.sourceId;

        userData.businessName =
          selectedCompany.name;
      }

      /* =================================================
         6. CREATE USER PROFILE

         /users contains the profile and requested
         authorization information.
      ================================================= */

      const userProfileRef =
        await addDoc(
          collection(
            db,
            "users"
          ),
          userData
        );

      /* =================================================
         7. AUTOMATIC USER ACCESS

         Document ID MUST be the Firebase Auth UID.

         New users always start:

         status      = pending
         accessLevel = pending

         Admin approval later activates the account.
      ================================================= */

      const userAccessData: any = {
        uid,

        name:
          name.trim(),

        email:
          email
            .trim()
            .toLowerCase(),

        userType:
          type,

        accessLevel:
          "pending",

        status:
          "pending",

        companyId:
          null,

        syncedFromUserDoc:
          userProfileRef.id,

        createdAt:
          serverTimestamp(),

        updatedAt:
          serverTimestamp(),
      };

      /* -------------------------------------------------
         EDO ACCESS REFERENCE
      ------------------------------------------------- */

      if (
        type === "edo" &&
        selectedCompany
      ) {
        userAccessData.companyId =
          selectedCompany.sourceId;
      }

      /* -------------------------------------------------
         RELIEVER ACCESS REFERENCE
      ------------------------------------------------- */

      if (
        type === "reliever" &&
        selectedCompany
      ) {
        userAccessData.relieverId =
          selectedCompany.sourceId;
      }

      /* =================================================
         8. CREATE AUTHORIZATION RECORD
      ================================================= */

      await setDoc(
        doc(
          db,
          "userAccess",
          uid
        ),
        userAccessData
      );

      /* =================================================
         COMPLETE
      ================================================= */

      alert(
        "Account created successfully. Await admin approval."
      );

      router.push("/");

    } catch (error: any) {
      console.error(
        "Signup error:",
        error
      );

      alert(
        error?.message ||
          "Unable to create account."
      );

    } finally {
      setLoading(false);
    }
  }

  /* =======================================================
     PAGE
  ======================================================= */

  return (
    <div className="w-full lg:grid lg:min-h-screen lg:grid-cols-2">

      {/* =================================================
          LEFT PANEL
      ================================================= */}

      <div className="hidden lg:flex flex-col justify-center items-center bg-[#0b1b3f] text-white p-10">

        <img
          src="/logo.png"
          alt="Taskraft Logo"
          className="w-40 mb-6"
        />

        <p className="text-sm text-gray-300 text-center max-w-xs">
          Build. Track. Scale your operations with precision.
        </p>

      </div>

      {/* =================================================
          RIGHT PANEL
      ================================================= */}

      <div className="flex items-center justify-center py-12 bg-gray-50">

        <div className="w-full max-w-md bg-white shadow-lg rounded-xl p-6 space-y-4">

          <h1 className="text-2xl font-semibold text-center">
            Create Account
          </h1>

          {/* ===============================================
              SIGNUP DIRECTORY ERROR
          =============================================== */}

          {signupDataError && (
            <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {signupDataError}
            </div>
          )}

          {/* ===============================================
              NAME
          =============================================== */}

          <input
            placeholder="Name and Surname"
            className="w-full border px-3 py-2 rounded"
            value={name}
            onChange={(e) =>
              setName(
                e.target.value
              )
            }
          />

          {/* ===============================================
              USER TYPE
          =============================================== */}

          <select
            className="w-full border px-3 py-2 rounded"
            value={type}
            onChange={(e) => {
              setType(
                e.target.value
              );

              /*
                Reset the company selection whenever
                the user changes registration type.
              */

              setSelectedId("");
            }}
          >

            <option value="">
              Select User Type
            </option>

            <option value="taskraft">
              Taskraft
            </option>

            <option value="edo">
              EDO
            </option>

            <option value="reliever">
              Reliever
            </option>

          </select>

          {/* ===============================================
              EDO COMPANY
          =============================================== */}

          {type === "edo" && (
            <select
              className="w-full border px-3 py-2 rounded"
              value={selectedId}
              disabled={
                loadingSignupData
              }
              onChange={(e) =>
                setSelectedId(
                  e.target.value
                )
              }
            >

              <option value="">

                {loadingSignupData
                  ? "Loading EDO companies..."
                  : edoCompanies.length === 0
                  ? "No EDO companies available"
                  : "Select EDO"}

              </option>

              {edoCompanies.map(
                (company) => (
                  <option
                    key={
                      company.id
                    }
                    value={
                      company.id
                    }
                  >
                    {company.name}
                  </option>
                )
              )}

            </select>
          )}

          {/* ===============================================
              RELIEVER COMPANY
          =============================================== */}

          {type ===
            "reliever" && (
            <select
              className="w-full border px-3 py-2 rounded"
              value={selectedId}
              disabled={
                loadingSignupData
              }
              onChange={(e) =>
                setSelectedId(
                  e.target.value
                )
              }
            >

              <option value="">

                {loadingSignupData
                  ? "Loading Reliever companies..."
                  : relieverCompanies.length === 0
                  ? "No Reliever companies available"
                  : "Select Reliever"}

              </option>

              {relieverCompanies.map(
                (company) => (
                  <option
                    key={
                      company.id
                    }
                    value={
                      company.id
                    }
                  >
                    {company.name}
                  </option>
                )
              )}

            </select>
          )}

          {/* ===============================================
              EMAIL
          =============================================== */}

          <input
            type="email"
            placeholder="Email"
            className="w-full border px-3 py-2 rounded"
            value={email}
            onChange={(e) =>
              setEmail(
                e.target.value
              )
            }
          />

          {/* ===============================================
              PASSWORD
          =============================================== */}

          <input
            type="password"
            placeholder="Password"
            className="w-full border px-3 py-2 rounded"
            value={password}
            onChange={(e) =>
              setPassword(
                e.target.value
              )
            }
          />

          {/* ===============================================
              CONFIRM PASSWORD
          =============================================== */}

          <input
            type="password"
            placeholder="Confirm Password"
            className="w-full border px-3 py-2 rounded"
            value={
              confirmPassword
            }
            onChange={(e) =>
              setConfirmPassword(
                e.target.value
              )
            }
          />

          {/* ===============================================
              TERMS
          =============================================== */}

          <div className="flex items-start gap-2 text-sm">

            <input
              type="checkbox"
              checked={
                acceptedTerms
              }
              onChange={(e) =>
                setAcceptedTerms(
                  e.target.checked
                )
              }
              className="mt-1"
            />

            <span>

              I agree to the{" "}

              <a
                href="/terms"
                className="text-blue-600 underline"
              >
                Terms & Conditions (POPIA)
              </a>

            </span>

          </div>

          {/* ===============================================
              SUBMIT
          =============================================== */}

          <button
            type="button"
            onClick={
              handleSignup
            }
            disabled={
              loading ||
              !acceptedTerms ||
              loadingSignupData
            }
            className={`w-full py-2 rounded text-white ${
              acceptedTerms &&
              !loadingSignupData
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-gray-400"
            }`}
          >

            {loading
              ? "Creating..."
              : "Create Account"}

          </button>

          {/* ===============================================
              BACK TO LOGIN
          =============================================== */}

          <p
            onClick={() =>
              router.push("/")
            }
            className="text-sm text-center text-blue-600 cursor-pointer"
          >
            Back to Login
          </p>

        </div>

      </div>

    </div>
  );
}