// src/app/page.tsx

import Image from 'next/image';
import { LoginForm } from '@/components/login-form';
import Link from 'next/link';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp', '.ico', '.svg',
]);

async function getLoginImages() {
  const imageDirectory = path.join(process.cwd(), 'public', 'login-images');

  try {
    const entries = await readdir(imageDirectory, { withFileTypes: true });

    return entries
      .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => `/login-images/${encodeURIComponent(entry.name)}`)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const loginImages = await getLoginImages();
  const loginBg = loginImages.length
    ? loginImages[Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000)) % loginImages.length]
    : null;

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
        {loginBg ? (
          <img
            src={loginBg}
            alt="Taskraft business operations"
            className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.3]"
          />
        ) : (
          <div className="absolute inset-0 bg-slate-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-black/5" />
        <div className="absolute bottom-5 right-6 rounded-full bg-black/35 px-3 py-1.5 text-xs text-white/90 backdrop-blur-sm">
          Taskraft • Business in motion
        </div>
      </div>
    </div>
  );
}
