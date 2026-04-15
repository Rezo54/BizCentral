"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";

export default function TermsPage() {
  const router = useRouter();

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">

      {/* 🔥 LOGO */}
      <div className="flex justify-center mb-4">
        <Image
          src="/logo.png" // 👉 make sure this exists in /public
          alt="Taskraft Logo"
          width={140}
          height={60}
          priority
        />
      </div>

      {/* 🔙 BACK TO Signup */}
      <p
        onClick={() => router.push("/signup")}
        className="text-sm text-blue-600 cursor-pointer hover:underline"
      >
        ← Back to Signup
      </p>

      <h1 className="text-2xl font-bold">
        Terms & Conditions (POPIA)
      </h1>

      <p>
        By using this platform, you consent to the collection, processing,
        and storage of your personal information in accordance with the
        Protection of Personal Information Act (POPIA) of South Africa.
      </p>

      <p>
        Taskraft collects personal data such as your name, email address,
        and business details for operational purposes including account
        management, communication, and service delivery.
      </p>

      <p>
        Your information will not be shared with third parties without your
        consent, unless required by law.
      </p>

      <p>
        You have the right to request access, correction, or deletion of
        your personal data at any time.
      </p>

      <p>
        By continuing to use this platform, you acknowledge that you have
        read and agree to these terms.
      </p>
    </div>
  );
}