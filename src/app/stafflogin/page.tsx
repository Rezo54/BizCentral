'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';

const formSchema = z.object({
  cellphone: z.string().min(10, { message: 'Enter a valid cellphone number.' }).max(15, { message: 'Enter a valid cellphone number.' }),
  pin: z.string().regex(/^\d{6}$/, { message: 'PIN must be exactly 6 digits.' }),
});

type FormValues = z.infer<typeof formSchema>;

const SUSPENDED_MESSAGE =
  'Your Employee Portal account is currently suspended. Please contact your employer or administrator if you believe this is incorrect.';

export default function EmployeeLoginPage() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [showPin, setShowPin] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { cellphone: '', pin: '' },
  });

  useEffect(() => {
    if (searchParams.get('reason') !== 'suspended') return;
    toast({
      variant: 'destructive',
      title: 'Account Suspended',
      description: SUSPENDED_MESSAGE,
    });
    router.replace('/stafflogin');
  }, [router, searchParams, toast]);

  async function onSubmit(values: FormValues) {
    setIsLoading(true);
    try {
      const response = await fetch('/api/staff/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ cellphone: values.cellphone, pin: values.pin }),
      });
      const data = await response.json();

      if (!response.ok || data?.success !== true) {
        if (data?.code === 'ACCOUNT_SUSPENDED') {
          toast({
            variant: 'destructive',
            title: 'Account Suspended',
            description: SUSPENDED_MESSAGE,
          });
          form.setValue('pin', '');
          return;
        }
        throw new Error(data?.message || 'Invalid cellphone number or PIN.');
      }

      toast({
        title: 'Login Successful',
        description: 'Welcome to the Employee Portal.',
      });
      form.reset({ cellphone: values.cellphone, pin: '' });
      router.replace('/staffportal');
      router.refresh();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to log in. Please try again.';
      toast({ variant: 'destructive', title: 'Login Failed', description: message });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md">
        <div className="rounded-xl border bg-background p-6 shadow-sm">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold">Employee Portal</h1>
            <p className="mt-2 text-sm text-muted-foreground">Login using your cellphone number and PIN</p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="cellphone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cellphone Number</FormLabel>
                    <FormControl>
                      <Input type="tel" inputMode="tel" autoComplete="tel" placeholder="082 123 4567" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="pin"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center">
                      <FormLabel>6-digit PIN</FormLabel>
                      <Link href="/people/employee/reset-pin" className="ml-auto text-sm text-blue-600 hover:underline">
                        Forgot PIN?
                      </Link>
                    </div>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showPin ? 'text' : 'password'}
                          inputMode="numeric"
                          autoComplete="current-password"
                          maxLength={6}
                          placeholder="••••••"
                          {...field}
                          onChange={(event) => field.onChange(event.target.value.replace(/\D/g, ''))}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPin(!showPin)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                        >
                          {showPin ? 'Hide' : 'Show'}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Logging in...' : 'Login'}
              </Button>
            </form>
          </Form>

          <div className="mt-6 border-t pt-5 text-center">
            <p className="text-sm text-muted-foreground">First time using the Employee Portal?</p>
            <Link href="/stafflogin/activate" className="mt-2 inline-block text-sm font-medium text-blue-600 hover:underline">
              Activate your account →
            </Link>
          </div>
        </div>

        <div className="mt-5 text-center">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
            ← Back to BizCentral Login
          </Link>
        </div>
      </div>
    </div>
  );
}
