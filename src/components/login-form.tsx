'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';

import {
  getAuth,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";

import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

const formSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
});

export function LoginForm() {
  const router = useRouter();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);

  // 🔥 RESET STATES
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  // =============================
  // LOGIN
  // =============================
  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);

    try {
      const auth = getAuth();

      const userCred = await signInWithEmailAndPassword(
        auth,
        values.email,
        values.password
      );

      const uid = userCred.user.uid;

      const q = query(collection(db, "users"), where("uid", "==", uid));
      const snap = await getDocs(q);

      if (snap.empty) {
        throw new Error("User record not found");
      }

      const userData = snap.docs[0].data();

      if (userData.status !== "approved") {
        toast({
          variant: "destructive",
          title: "Access Pending",
          description: "Your account is awaiting approval.",
        });
        setIsLoading(false);
        return;
      }

      toast({
        title: "Login Successful",
        description: "Welcome back!",
      });

      router.push("/dashboard");

    } catch (err: any) {
      console.error(err);

      toast({
        variant: "destructive",
        title: "Login Failed",
        description: getFirebaseErrorMessage(err),
      });

      setIsLoading(false);
    }
  }
function getFirebaseErrorMessage(error: any) {
  const code = error.code || "";

  switch (code) {
    case "auth/user-not-found":
      return "No account found with this email.";

    case "auth/invalid-credential":
      return "Invalid credentials. Please try again.";

    case "auth/wrong-password":
      return "Incorrect password.";

    case "auth/invalid-email":
      return "Invalid email address.";

    case "auth/too-many-requests":
      return "Too many attempts. Try again later.";

    case "auth/network-request-failed":
      return "Network error. Check your connection.";

    case "auth/email-already-in-use":
      return "This email is already registered.";

    default:
      return "Something went wrong. Please try again.";
  }
}

  // =============================
  // PASSWORD RESET
  // =============================
  async function handlePasswordReset() {
    if (!resetEmail) {
      toast({
        variant: "destructive",
        title: "Missing Email",
        description: "Please enter your email.",
      });
      return;
    }

    try {
      setResetLoading(true);

      const auth = getAuth();
      await sendPasswordResetEmail(auth, resetEmail);

      toast({
        title: "Reset Email Sent",
        description: "Check your inbox to reset your password.",
      });

      setShowReset(false);
      setResetEmail("");

    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err.message,
      });
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">

          {/* EMAIL */}
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input placeholder="m@example.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* PASSWORD */}
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center">
                  <FormLabel>Password</FormLabel>

                  {/* 🔥 RESET LINK */}
                  <button
                    type="button"
                    onClick={() => setShowReset(true)}
                    className="ml-auto text-sm underline text-blue-600 hover:text-blue-800"
                  >
                    Forgot your password?
                  </button>
                </div>

                <FormControl>
                  <Input type="password" {...field} />
                </FormControl>

                <FormMessage />
              </FormItem>
            )}
          />

          {/* LOGIN BUTTON */}
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Logging in...' : 'Login'}
          </Button>

        </form>
      </Form>

      {/* =============================
          🔥 RESET MODAL
      ============================= */}
      {showReset && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-sm space-y-4 shadow-lg">

            <h2 className="text-lg font-semibold">Reset Password</h2>

            <p className="text-sm text-gray-500">
              Enter your email to receive a reset link.
            </p>

            <input
              type="email"
              placeholder="Email address"
              className="w-full border px-3 py-2 rounded"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
            />

            <div className="flex justify-end gap-2">

              <button
                onClick={() => setShowReset(false)}
                className="px-3 py-2 text-sm text-gray-600"
              >
                Cancel
              </button>

              <button
                onClick={handlePasswordReset}
                disabled={resetLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                {resetLoading ? "Sending..." : "Send Reset"}
              </button>

            </div>
          </div>
        </div>
      )}
    </>
  );
}