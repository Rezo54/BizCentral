'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import {
  ConfirmationResult,
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from 'firebase/auth';

import { auth } from '@/lib/firebase';

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
// TYPES
// =====================================================

type ActivationStep =
  | 'identify'
  | 'otp'
  | 'create-pin'
  | 'complete';

// =====================================================
// SOUTH AFRICAN CELLPHONE NORMALISATION
// =====================================================

function cleanCellphone(value: string) {
  return value.replace(/\D/g, '');
}

function displayCellphone(value: string) {
  const cleaned = cleanCellphone(value);

  // Local SA format
  if (
    cleaned.length === 10 &&
    cleaned.startsWith('0')
  ) {
    return `${cleaned.slice(0, 3)} ${cleaned.slice(
      3,
      6
    )} ${cleaned.slice(6)}`;
  }

  // Firebase international format:
  // +27821234567
  if (
    cleaned.length === 11 &&
    cleaned.startsWith('27')
  ) {
    return `0${cleaned.slice(2, 4)} ${cleaned.slice(
      4,
      7
    )} ${cleaned.slice(7)}`;
  }

  return value;
}

// =====================================================
// STEP 1 VALIDATION
// =====================================================

const identifySchema = z.object({
  cellphone: z
    .string()
    .transform(cleanCellphone)
    .refine(
      (value) => /^0\d{9}$/.test(value),
      'Enter a valid 10-digit cellphone number.'
    ),

  idLastSix: z
    .string()
    .regex(/^\d{6}$/, {
      message:
        'Enter the last 6 digits of your ID number.',
    }),
});

type IdentifyValues =
  z.infer<typeof identifySchema>;

// =====================================================
// STEP 2 VALIDATION
// =====================================================

const otpSchema = z.object({
  otp: z
    .string()
    .regex(/^\d{6}$/, {
      message:
        'Enter the 6-digit OTP sent to your cellphone.',
    }),
});

type OtpValues =
  z.infer<typeof otpSchema>;

// =====================================================
// STEP 3 VALIDATION
// =====================================================

const pinSchema = z
  .object({
    pin: z
      .string()
      .regex(/^\d{6}$/, {
        message:
          'PIN must be exactly 6 digits.',
      }),

    confirmPin: z
      .string()
      .regex(/^\d{6}$/, {
        message:
          'Please confirm your 6-digit PIN.',
      }),
  })
  .refine(
    (data) =>
      data.pin === data.confirmPin,
    {
      message:
        'PINs do not match.',
      path: ['confirmPin'],
    }
  );

type PinValues =
  z.infer<typeof pinSchema>;

// =====================================================
// PAGE
// =====================================================

export default function EmployeeActivatePage() {
  const { toast } = useToast();

  const [step, setStep] =
    useState<ActivationStep>('identify');

  const [cellphone, setCellphone] =
    useState('');

  const [isLoading, setIsLoading] =
    useState(false);

  const confirmationResultRef =
    useRef<ConfirmationResult | null>(
      null
    );

  const recaptchaVerifierRef =
    useRef<RecaptchaVerifier | null>(
      null
    );

  const [
    verifiedAuthUid,
    setVerifiedAuthUid,
  ] = useState('');

  const [showPin, setShowPin] =
    useState(false);

  const [
    showConfirmPin,
    setShowConfirmPin,
  ] = useState(false);

  // =====================================================
  // FORMS
  // =====================================================

  const identifyForm =
    useForm<IdentifyValues>({
      resolver:
        zodResolver(identifySchema),

      defaultValues: {
        cellphone: '',
        idLastSix: '',
      },
    });

  const otpForm =
    useForm<OtpValues>({
      resolver:
        zodResolver(otpSchema),

      defaultValues: {
        otp: '',
      },
    });

  const pinForm =
    useForm<PinValues>({
      resolver:
        zodResolver(pinSchema),

      defaultValues: {
        pin: '',
        confirmPin: '',
      },
    });

  // =====================================================
  // FIREBASE RECAPTCHA
  // =====================================================

  function getRecaptchaVerifier() {
    if (
      recaptchaVerifierRef.current
    ) {
      return (
        recaptchaVerifierRef.current
      );
    }

    const verifier =
      new RecaptchaVerifier(
        auth,
        'recaptcha-container',
        {
          size: 'invisible',

          callback: () => {
            console.log(
              'reCAPTCHA verification completed.'
            );
          },

          'expired-callback':
            () => {
              console.log(
                'reCAPTCHA expired.'
              );
            },
        }
      );

    recaptchaVerifierRef.current =
      verifier;

    return verifier;
  }

  function clearRecaptchaVerifier() {
    if (
      recaptchaVerifierRef.current
    ) {
      try {
        recaptchaVerifierRef.current.clear();
      } catch {
        // Ignore cleanup errors.
      }

      recaptchaVerifierRef.current =
        null;
    }
  }

  // =====================================================
  // STEP 1
  // VERIFY EMPLOYEE + SEND OTP
  // =====================================================

  async function handleIdentify(
    values: IdentifyValues
  ) {
    setIsLoading(true);

    try {
      // ===============================================
      // FIRST:
      // SECURE BIZCENTRAL EMPLOYEE VERIFICATION
      //
      // This checks:
      // - employee exists
      // - cellphone
      // - employed status
      // - last 6 ID via HMAC
      // - OTP rate limits
      // ===============================================

      const response =
        await fetch(
          '/api/staff/activation/check',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify({
              cellphone:
                values.cellphone,

              idLastSix:
                values.idLastSix,
            }),
          }
        );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.message ||
            'Unable to verify employee details.'
        );
      }

      const verifiedCellphone =
        String(
          result.cellphone || ''
        );

      if (
        !verifiedCellphone.startsWith(
          '+27'
        )
      ) {
        throw new Error(
          'The employee cellphone number could not be prepared for SMS verification.'
        );
      }

      setCellphone(
        verifiedCellphone
      );

      // ===============================================
      // FIREBASE PHONE AUTH
      // ===============================================

      clearRecaptchaVerifier();

      const verifier =
        getRecaptchaVerifier();

      const confirmationResult =
        await signInWithPhoneNumber(
          auth,
          verifiedCellphone,
          verifier
        );

      confirmationResultRef.current =
        confirmationResult;

      otpForm.reset({
        otp: '',
      });

      setStep('otp');

      toast({
        title:
          'Verification Code Sent',

        description:
          'A 6-digit verification code has been sent to your cellphone.',
      });

    } catch (error: any) {
      console.error(
        'Employee activation / OTP error:',
        error
      );

      // Firebase reCAPTCHA instances can
      // become unusable after a failed
      // phone-auth attempt.
      clearRecaptchaVerifier();

      let message =
        error?.message ||
        'Unable to verify your employee details.';

      switch (error?.code) {
        case 'auth/operation-not-allowed':
          message =
            'Phone authentication is not enabled in Firebase.';
          break;

        case 'auth/invalid-phone-number':
          message =
            'The cellphone number on your employee record is invalid.';
          break;

        case 'auth/unauthorized-domain':
          message =
            'This website is not authorised for Firebase Phone Authentication.';
          break;

        case 'auth/captcha-check-failed':
          message =
            'The security verification failed. Please try again.';
          break;

        case 'auth/too-many-requests':
          message =
            'Too many verification attempts have been made. Please try again later.';
          break;

        case 'auth/quota-exceeded':
          message =
            'The SMS verification quota has been reached. Please contact your administrator.';
          break;

        case 'auth/missing-phone-number':
          message =
            'No cellphone number was supplied for verification.';
          break;
      }

      toast({
        variant: 'destructive',
        title:
          'Unable to Activate',
        description: message,
      });

    } finally {
      setIsLoading(false);
    }
  }

  // =====================================================
  // STEP 2
  // VERIFY REAL FIREBASE OTP
  // =====================================================

  async function handleOtp(
    values: OtpValues
  ) {
    setIsLoading(true);

    try {
      const confirmationResult =
        confirmationResultRef.current;

      if (!confirmationResult) {
        throw new Error(
          'Your verification session has expired. Please request a new OTP.'
        );
      }

      // ===============================================
      // FIREBASE VERIFIES SMS CODE
      // ===============================================

      const userCredential =
        await confirmationResult.confirm(
          values.otp
        );

      const firebaseUser =
        userCredential.user;

      if (!firebaseUser.uid) {
        throw new Error(
          'Firebase could not create the employee authentication identity.'
        );
      }

      setVerifiedAuthUid(
        firebaseUser.uid
      );

      confirmationResultRef.current =
        null;

      clearRecaptchaVerifier();

      pinForm.reset({
        pin: '',
        confirmPin: '',
      });

      setStep('create-pin');

      toast({
        title:
          'Cellphone Verified',

        description:
          'Create your Employee Portal PIN.',
      });

    } catch (error: any) {
      console.error(
        'OTP verification error:',
        error
      );

      let message =
        'The verification code is incorrect or has expired.';

      switch (error?.code) {
        case 'auth/invalid-verification-code':
          message =
            'The verification code is incorrect.';
          break;

        case 'auth/code-expired':
          message =
            'The verification code has expired. Please request another OTP.';
          break;

        case 'auth/session-expired':
          message =
            'Your verification session has expired. Please request another OTP.';
          break;

        case 'auth/too-many-requests':
          message =
            'Too many verification attempts have been made. Please try again later.';
          break;
      }

      toast({
        variant: 'destructive',
        title: 'Invalid OTP',
        description: message,
      });

    } finally {
      setIsLoading(false);
    }
  }

  // =====================================================
  // RESEND OTP
  //
  // IMPORTANT:
  // We deliberately DO NOT call Firebase directly here.
  //
  // Resend must later pass through our server-side
  // OTP rate limiter again.
  // =====================================================

  async function handleResendOtp() {
    toast({
      title: 'Please wait',
      description:
        'OTP resend will be enabled after the first activation test.',
    });
  }

  // =====================================================
  // CHANGE NUMBER
  // =====================================================

  function handleChangeNumber() {
    confirmationResultRef.current =
      null;

    clearRecaptchaVerifier();

    otpForm.reset({
      otp: '',
    });

    setCellphone('');

    setStep('identify');
  }

  // =====================================================
  // STEP 3
  // CREATE PIN
  //
  // NOTE:
  // PIN persistence is deliberately the NEXT backend
  // step. We will not store a raw PIN in Firestore.
  // =====================================================

  async function handleCreatePin(
    values: PinValues
  ) {
    setIsLoading(true);

    try {
      if (!verifiedAuthUid) {
        throw new Error(
          'Your verified authentication session is missing. Please restart account activation.'
        );
      }

      if (
        values.pin !==
        values.confirmPin
      ) {
        throw new Error(
          'PINs do not match.'
        );
      }

      /*
        NEXT IMPLEMENTATION:

        We will send the PIN to a secure
        server-side activation endpoint.

        That endpoint will:

        1. Validate the Firebase identity.
        2. Match authUid to this employee.
        3. Securely hash the PIN.
        4. Store ONLY the PIN hash.
        5. Save authUid.
        6. Set portalActivated = true.

        NEVER store values.pin directly
        in Firestore.
      */

      console.log(
        'PIN validated for verified Firebase user.'
      );

      // TEMPORARY UNTIL THE SECURE PIN
      // ACTIVATION ENDPOINT IS ADDED.
      setStep('complete');

      toast({
        title:
          'PIN Validated',

        description:
          'OTP verification succeeded. PIN persistence is the next security step.',
      });

    } catch (error: any) {
      console.error(
        'PIN creation error:',
        error
      );

      toast({
        variant: 'destructive',
        title:
          'Activation Failed',

        description:
          error?.message ||
          'Unable to create your Employee Portal account.',
      });

    } finally {
      setIsLoading(false);
    }
  }

  // =====================================================
  // UI
  // =====================================================

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">

      {/* ===============================================
          FIREBASE PHONE AUTH
          INVISIBLE RECAPTCHA CONTAINER
      =============================================== */}

      <div id="recaptcha-container" />

      <div className="w-full max-w-md">

        <div className="rounded-xl border bg-background p-6 shadow-sm">

          {/* HEADER */}

          <div className="mb-6 text-center">

            <h1 className="text-2xl font-bold">
              Activate Employee Account
            </h1>

            <p className="mt-2 text-sm text-muted-foreground">
              Set up access to your BizCentral
              Employee Portal
            </p>

          </div>

          {/* =================================================
              STEP INDICATOR
          ================================================= */}

          {step !== 'complete' && (
            <div className="mb-7">

              <div className="flex items-center justify-between text-xs">

                <span
                  className={
                    step === 'identify'
                      ? 'font-semibold text-primary'
                      : 'text-muted-foreground'
                  }
                >
                  Verify
                </span>

                <span
                  className={
                    step === 'otp'
                      ? 'font-semibold text-primary'
                      : 'text-muted-foreground'
                  }
                >
                  OTP
                </span>

                <span
                  className={
                    step === 'create-pin'
                      ? 'font-semibold text-primary'
                      : 'text-muted-foreground'
                  }
                >
                  Create PIN
                </span>

              </div>

            </div>
          )}

          {/* =================================================
              STEP 1
          ================================================= */}

          {step === 'identify' && (

            <Form {...identifyForm}>

              <form
                onSubmit={
                  identifyForm.handleSubmit(
                    handleIdentify
                  )
                }
                className="space-y-5"
              >

                <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                  Enter the cellphone number registered
                  against your employee record.
                </div>

                <FormField
                  control={
                    identifyForm.control
                  }
                  name="cellphone"
                  render={({ field }) => (

                    <FormItem>

                      <FormLabel>
                        Cellphone Number
                      </FormLabel>

                      <FormControl>

                        <Input
                          type="tel"
                          inputMode="numeric"
                          autoComplete="tel"
                          placeholder="082 123 4567"
                          {...field}
                        />

                      </FormControl>

                      <FormMessage />

                    </FormItem>

                  )}
                />

                <FormField
                  control={
                    identifyForm.control
                  }
                  name="idLastSix"
                  render={({ field }) => (

                    <FormItem>

                      <FormLabel>
                        Last 6 digits of ID Number
                      </FormLabel>

                      <FormControl>

                        <Input
                          type="password"
                          inputMode="numeric"
                          maxLength={6}
                          placeholder="••••••"
                          {...field}
                          onChange={(event) => {

                            const value =
                              event.target.value.replace(
                                /\D/g,
                                ''
                              );

                            field.onChange(
                              value
                            );

                          }}
                        />

                      </FormControl>

                      <FormMessage />

                    </FormItem>

                  )}
                />

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading
                    ? 'Checking...'
                    : 'Continue'}
                </Button>

              </form>

            </Form>

          )}

          {/* =================================================
              STEP 2 - OTP VERIFICATION
          ================================================= */}

          {step === 'otp' && (

            <Form {...otpForm}>

              <form
                onSubmit={
                  otpForm.handleSubmit(
                    handleOtp
                  )
                }
                className="space-y-5"
              >

                {/* OTP MESSAGE */}

                <div className="text-center">

                  <p className="text-sm text-muted-foreground">
                    Enter the 6-digit verification code sent to
                  </p>

                  <p className="mt-1 font-medium">
                    {displayCellphone(
                      cellphone
                    )}
                  </p>

                </div>

                {/* OTP INPUT */}

                <FormField
                  control={
                    otpForm.control
                  }
                  name="otp"
                  render={({ field }) => (

                    <FormItem>

                      <FormLabel>
                        Verification Code
                      </FormLabel>

                      <FormControl>

                        <Input
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          className="text-center text-lg tracking-[0.4em]"
                          placeholder="000000"
                          {...field}
                          onChange={(event) => {

                            const value =
                              event.target.value.replace(
                                /\D/g,
                                ''
                              );

                            field.onChange(
                              value
                            );

                          }}
                        />

                      </FormControl>

                      <FormMessage />

                    </FormItem>

                  )}
                />

                {/* CHANGE NUMBER / RESEND */}

                <div className="flex items-center justify-between text-sm">

                  <button
                    type="button"
                    onClick={
                      handleChangeNumber
                    }
                    disabled={
                      isLoading
                    }
                    className="text-muted-foreground hover:underline disabled:opacity-50"
                  >
                    ← Change number
                  </button>

                  <button
                    type="button"
                    onClick={
                      handleResendOtp
                    }
                    disabled={
                      isLoading
                    }
                    className="text-blue-600 hover:underline disabled:opacity-50"
                  >
                    Resend OTP
                  </button>

                </div>

                {/* VERIFY BUTTON - BOTTOM */}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading
                    ? 'Verifying...'
                    : 'Verify OTP'}
                </Button>

              </form>

            </Form>

          )}

          {/* =================================================
              STEP 3 - CREATE PIN
          ================================================= */}

          {step === 'create-pin' && (

            <Form {...pinForm}>

              <form
                onSubmit={
                  pinForm.handleSubmit(
                    handleCreatePin
                  )
                }
                className="space-y-5"
              >

                <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                  Create a 6-digit PIN. You will use
                  this PIN with your cellphone number
                  when logging into the Employee Portal.
                </div>

                {/* PIN */}

                <FormField
                  control={
                    pinForm.control
                  }
                  name="pin"
                  render={({ field }) => (

                    <FormItem>

                      <FormLabel>
                        Create PIN
                      </FormLabel>

                      <FormControl>

                        <div className="relative">

                          <Input
                            type={
                              showPin
                                ? 'text'
                                : 'password'
                            }
                            inputMode="numeric"
                            maxLength={6}
                            placeholder="••••••"
                            {...field}
                            onChange={(event) => {

                              const value =
                                event.target.value.replace(
                                  /\D/g,
                                  ''
                                );

                              field.onChange(
                                value
                              );

                            }}
                          />

                          <button
                            type="button"
                            onClick={() =>
                              setShowPin(
                                !showPin
                              )
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

                {/* CONFIRM PIN */}

                <FormField
                  control={
                    pinForm.control
                  }
                  name="confirmPin"
                  render={({ field }) => (

                    <FormItem>

                      <FormLabel>
                        Confirm PIN
                      </FormLabel>

                      <FormControl>

                        <div className="relative">

                          <Input
                            type={
                              showConfirmPin
                                ? 'text'
                                : 'password'
                            }
                            inputMode="numeric"
                            maxLength={6}
                            placeholder="••••••"
                            {...field}
                            onChange={(event) => {

                              const value =
                                event.target.value.replace(
                                  /\D/g,
                                  ''
                                );

                              field.onChange(
                                value
                              );

                            }}
                          />

                          <button
                            type="button"
                            onClick={() =>
                              setShowConfirmPin(
                                !showConfirmPin
                              )
                            }
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                          >
                            {showConfirmPin
                              ? 'Hide'
                              : 'Show'}
                          </button>

                        </div>

                      </FormControl>

                      <FormMessage />

                    </FormItem>

                  )}
                />

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading
                    ? 'Activating...'
                    : 'Activate Account'}
                </Button>

              </form>

            </Form>

          )}

          {/* =================================================
              COMPLETE
          ================================================= */}

          {step === 'complete' && (

            <div className="space-y-5 text-center">

              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl">
                ✓
              </div>

              <div>

                <h2 className="text-xl font-semibold">
                  OTP Test Successful
                </h2>

                <p className="mt-2 text-sm text-muted-foreground">
                  Your cellphone has been verified and
                  your PIN passed validation.
                </p>

              </div>

              <Link href="/stafflogin">

                <Button className="w-full">
                  Continue to Login
                </Button>

              </Link>

            </div>

          )}

        </div>

        {/* BACK */}

        {step !== 'complete' && (

          <div className="mt-5 text-center">

            <Link
              href="/stafflogin"
              className="text-sm text-muted-foreground hover:text-foreground hover:underline"
            >
              ← Back to Employee Login
            </Link>

          </div>

        )}

      </div>

    </div>
  );
}