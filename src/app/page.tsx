// src/app/page.tsx

import Image from 'next/image';
import { LoginForm } from '@/components/login-form';
import Link from 'next/link';

const LOGIN_IMAGES = [
  {
    src: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1920&q=85',
    alt: 'Logistics warehouse and distribution operations',
  },
  {
    src: 'https://images.unsplash.com/photo-1494412574643-ff11b0a5c1c3?auto=format&fit=crop&w=1920&q=85',
    alt: 'Transport and logistics operations',
  },
  {
    src: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1920&q=85',
    alt: 'Modern business workspace',
  },
  {
    src: 'https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1920&q=85',
    alt: 'Business team working together',
  },
];

function currentWeeklyImage() {
  const week = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
  return LOGIN_IMAGES[week % LOGIN_IMAGES.length];
}

export default function LoginPage() {
  const loginBg = currentWeeklyImage();

  return (
    <div className="w-full lg:grid lg:min-h-screen lg:grid-cols-2">
      <div className="flex items-center justify-center py-12">
        <div className="mx-auto grid w-[350px] gap-6">
          <div className="flex justify-center">
            <Image
              src="/logo.png"
              alt="Taskraft Solutions That Work"
              width={220}
              height={90}
              className="h-auto w-[190px] object-contain"
              priority
            />
          </div>

          <div className="grid gap-2 text-center">
            <h1 className="text-3xl font-bold">Login to BizCentral</h1>
            <p className="text-balance text-muted-foreground">
              Enter your email below to login to your account
            </p>
          </div>

          <LoginForm />

          <div className="text-center text-sm">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="underline">Sign up</Link>
          </div>

          <div className="border-t pt-5 text-center">
            <p className="mb-2 text-sm text-muted-foreground">Are you an employee?</p>
            <Link href="/stafflogin" className="text-sm font-medium text-blue-600 hover:underline">
              Employee Login →
            </Link>
          </div>
        </div>
      </div>

      <div className="relative hidden overflow-hidden bg-muted lg:block">
        <img
          src={loginBg.src}
          alt={loginBg.alt}
          className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.3]"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-black/5" />
        <div className="absolute bottom-5 right-6 rounded-full bg-black/35 px-3 py-1.5 text-xs text-white/90 backdrop-blur-sm">
          Taskraft • Business in motion
        </div>
      </div>
    </div>
  );
}
