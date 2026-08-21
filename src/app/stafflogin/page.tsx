'use client';

import Link from 'next/link';
import { useState } from 'react';
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

// =====================================================
// VALIDATION
// =====================================================

const formSchema = z.object({
  cellphone: z
    .string()
    .min(10, {
      message: 'Enter a valid cellphone number.',
    })
    .max(15, {
      message: 'Enter a valid cellphone number.',
    }),

  pin: z
    .string()
    .regex(/^\d{6}$/, {
      message: 'PIN must be exactly 6 digits.',
    }),
});

type FormValues = z.infer<typeof formSchema>;

// =====================================================
// PAGE
// =====================================================

export default function EmployeeLoginPage() {
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [showPin, setShowPin] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),

    defaultValues: {
      cellphone: '',
      pin: '',
    },
  });

  // =====================================================
  // EMPLOYEE LOGIN
  // =====================================================

  async function onSubmit(values: FormValues) {
    setIsLoading(true);

    try {
      /*
        Employee authentication will be connected
        after the activation flow has been created.

        IMPORTANT:
        The employee PIN must never be stored as
        plain text in Firestore.
      */

      console.log('Employee login attempt:', {
        cellphone: values.cellphone,
      });

      toast({
        title: 'Employee Login',
        description:
          'Employee authentication will be enabled after account activation is configured.',
      });

    } catch (error: any) {

      console.error(
        'Employee login error:',
        error
      );

      toast({
        variant: 'destructive',
        title: 'Login Failed',
        description:
          error?.message ||
          'Unable to log in. Please try again.',
      });

    } finally {
      setIsLoading(false);
    }
  }

  // =====================================================
  // UI
  // =====================================================

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">

      <div className="w-full max-w-md">

        <div className="rounded-xl border bg-background p-6 shadow-sm">

          {/* =============================================
              HEADER
          ============================================= */}

          <div className="mb-6 text-center">

            <h1 className="text-2xl font-bold">
              Employee Portal
            </h1>

            <p className="mt-2 text-sm text-muted-foreground">
              Login using your cellphone number and PIN
            </p>

          </div>

          {/* =============================================
              LOGIN FORM
          ============================================= */}

          <Form {...form}>

            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-5"
            >

              {/* =========================================
                  CELLPHONE
              ========================================= */}

              <FormField
                control={form.control}
                name="cellphone"
                render={({ field }) => (

                  <FormItem>

                    <FormLabel>
                      Cellphone Number
                    </FormLabel>

                    <FormControl>

                      <Input
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="082 123 4567"
                        {...field}
                      />

                    </FormControl>

                    <FormMessage />

                  </FormItem>

                )}
              />

              {/* =========================================
                  PIN
              ========================================= */}

              <FormField
                control={form.control}
                name="pin"
                render={({ field }) => (

                  <FormItem>

                    <div className="flex items-center">

                      <FormLabel>
                        6-digit PIN
                      </FormLabel>

                      <Link
                        href="/people/employee/reset-pin"
                        className="ml-auto text-sm text-blue-600 hover:underline"
                      >
                        Forgot PIN?
                      </Link>

                    </div>

                    <FormControl>

                      <div className="relative">

                        <Input
                          type={
                            showPin
                              ? 'text'
                              : 'password'
                          }
                          inputMode="numeric"
                          autoComplete="current-password"
                          maxLength={6}
                          placeholder="••••••"
                          {...field}
                          onChange={(event) => {

                            const value =
                              event.target.value.replace(
                                /\D/g,
                                ''
                              );

                            field.onChange(value);

                          }}
                        />

                        <button
                          type="button"
                          onClick={() =>
                            setShowPin(!showPin)
                          }
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                        >
                          {showPin
                            ? 'Hide'
                            : 'Show'}
                        </button>

                      </div>

                    </FormControl>

                    <FormMessage />

                  </FormItem>

                )}
              />

              {/* =========================================
                  LOGIN BUTTON
              ========================================= */}

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading
                  ? 'Logging in...'
                  : 'Login'}
              </Button>

            </form>

          </Form>

          {/* =============================================
              ACCOUNT ACTIVATION
          ============================================= */}

          <div className="mt-6 border-t pt-5 text-center">
            <p className="text-sm text-muted-foreground">
                First time using the Employee Portal?
            </p>

            <Link
                href="/stafflogin/activate"
                className="mt-2 inline-block text-sm font-medium text-blue-600 hover:underline"
            >
                Activate your account →
            </Link>
            </div>

        </div>

        {/* ===============================================
            BACK TO MAIN LOGIN
        =============================================== */}

        <div className="mt-5 text-center">

          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            ← Back to BizCentral Login
          </Link>

        </div>

      </div>

    </div>
  );
}