// src/app/page.tsx

import Image from 'next/image';
import { LoginForm } from '@/components/login-form';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import Link from 'next/link';

export default function LoginPage() {
  const loginBg = PlaceHolderImages.find(
    (p) => p.id === 'login-background'
  );

  return (
    <div className="w-full lg:grid lg:min-h-screen lg:grid-cols-2">

      {/* =====================================================
          MAIN BIZCENTRAL LOGIN
      ===================================================== */}
      <div className="flex items-center justify-center py-12">

        <div className="mx-auto grid w-[350px] gap-6">

          {/* HEADER */}
          <div className="grid gap-2 text-center">

            <h1 className="text-3xl font-bold">
              Login to BizCentral
            </h1>

            <p className="text-balance text-muted-foreground">
              Enter your email below to login to your account
            </p>

          </div>

          {/* EXISTING LOGIN FORM */}
          <LoginForm />

          {/* EXISTING SIGNUP */}
          <div className="text-center text-sm">

            Don&apos;t have an account?{' '}

            <Link
              href="/signup"
              className="underline"
            >
              Sign up
            </Link>

          </div>

          {/* =================================================
              EMPLOYEE PORTAL
          ================================================= */}
          <div className="border-t pt-5 text-center">

            <p className="mb-2 text-sm text-muted-foreground">
              Are you an employee?
            </p>

            <Link
              href="/stafflogin"
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              Employee Login →
            </Link>

          </div>

        </div>

      </div>

      {/* =====================================================
          BACKGROUND IMAGE
      ===================================================== */}
      <div className="hidden bg-muted lg:block">

        {loginBg && (
          <Image
            src={loginBg.imageUrl}
            alt={loginBg.description}
            data-ai-hint={loginBg.imageHint}
            width="1920"
            height="1080"
            className="h-full w-full object-cover dark:brightness-[0.3]"
            priority
          />
        )}

      </div>

    </div>
  );
}