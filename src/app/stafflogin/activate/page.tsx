// src/app/stafflogin/activate/page.tsx

'use client';

import Link from 'next/link';
import {
  useEffect,
  useRef,
  useState,
} from 'react';

import { z } from 'zod';

import {
  useForm,
} from 'react-hook-form';

import {
  zodResolver,
} from '@hookform/resolvers/zod';

import {
  ConfirmationResult,
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from 'firebase/auth';

import { auth } from '@/lib/firebase';

import {
  Button,
} from '@/components/ui/button';

import {
  Input,
} from '@/components/ui/input';

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

import {
  useToast,
} from '@/hooks/use-toast';

// =====================================================
// TYPES
// =====================================================

type ActivationStep =
  | 'identify'
  | 'otp'
  | 'create-pin'
  | 'complete';

type ApiResult = {
  success?: boolean;
  code?: string;
  message?: string;
  cellphone?: string;
  employeeId?: string;
};

// =====================================================
// SOUTH AFRICAN CELLPHONE NORMALISATION
// =====================================================

function cleanCellphone(value: string) {
  return value.replace(/\D/g, '');
}

function displayCellphone(value: string) {
  const cleaned =
    cleanCellphone(value);

  // Local SA format:
  // 0821234567
  if (
    cleaned.length === 10 &&
    cleaned.startsWith('0')
  ) {
    return `${cleaned.slice(
      0,
      3
    )} ${cleaned.slice(
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
    return `0${cleaned.slice(
      2,
      4
    )} ${cleaned.slice(
      4,
      7
    )} ${cleaned.slice(7)}`;
  }

  return value;
}

// =====================================================
// SAFE API RESPONSE PARSING
//
// Netlify / Next.js may occasionally return a
// non-JSON error response before our route handler
// has an opportunity to generate its own JSON.
// =====================================================

async function readApiResponse(
  response: Response
): Promise<ApiResult> {
  const contentType =
    response.headers.get(
      'content-type'
    ) || '';

  if (
    contentType.includes(
      'application/json'
    )
  ) {
    try {
      return (
        (await response.json()) as ApiResult
      );
    } catch {
      return {
        success: false,
        code: 'INVALID_RESPONSE',
        message:
          'The server returned an invalid response. Please try again.',
      };
    }
  }

  return {
    success: false,
    code: 'SERVER_RESPONSE_ERROR',
    message:
      response.ok
        ? 'The server returned an unexpected response.'
        : 'The activation service is temporarily unavailable. Please try again.',
  };
}

// =====================================================
// STEP 1 VALIDATION
// =====================================================

const identifySchema =
  z.object({
    cellphone: z
      .string()
      .transform(cleanCellphone)
      .refine(
        (value) =>
          /^0\d{9}$/.test(value),
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
  z.infer<
    typeof identifySchema
  >;

// =====================================================
// STEP 2 VALIDATION
// =====================================================

const otpSchema =
  z.object({
    otp: z
      .string()
      .regex(/^\d{6}$/, {
        message:
          'Enter the 6-digit OTP sent to your cellphone.',
      }),
  });

type OtpValues =
  z.infer<
    typeof otpSchema
  >;

// =====================================================
// STEP 3 VALIDATION
// =====================================================

const pinSchema =
  z
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
        data.pin ===
        data.confirmPin,
      {
        message:
          'PINs do not match.',
        path: ['confirmPin'],
      }
    );

type PinValues =
  z.infer<
    typeof pinSchema
  >;

// =====================================================
// PAGE
// =====================================================

export default function EmployeeActivatePage() {
  const { toast } =
    useToast();

  const [
    step,
    setStep,
  ] =
    useState<ActivationStep>(
      'identify'
    );

  const [
    cellphone,
    setCellphone,
  ] =
    useState('');

  const [
    isLoading,
    setIsLoading,
  ] =
    useState(false);

  const [
    verifiedAuthUid,
    setVerifiedAuthUid,
  ] =
    useState('');

  const [
    showPin,
    setShowPin,
  ] =
    useState(false);

  const [
    showConfirmPin,
    setShowConfirmPin,
  ] =
    useState(false);

  const confirmationResultRef =
    useRef<
      ConfirmationResult | null
    >(null);

  const recaptchaVerifierRef =
    useRef<
      RecaptchaVerifier | null
    >(null);

  // =====================================================
  // FORMS
  // =====================================================

  const identifyForm =
    useForm<IdentifyValues>({
      resolver:
        zodResolver(
          identifySchema
        ),

      defaultValues: {
        cellphone: '',
        idLastSix: '',
      },
    });

  const otpForm =
    useForm<OtpValues>({
      resolver:
        zodResolver(
          otpSchema
        ),

      defaultValues: {
        otp: '',
      },
    });

  const pinForm =
    useForm<PinValues>({
      resolver:
        zodResolver(
          pinSchema
        ),

      defaultValues: {
        pin: '',
        confirmPin: '',
      },
    });

  // =====================================================
  // FIREBASE RECAPTCHA
  // =====================================================

  function clearRecaptchaVerifier() {
    const verifier =
      recaptchaVerifierRef.current;

    if (verifier) {
      try {
        verifier.clear();
      } catch {
        // Cleanup failure is non-fatal.
      }

      recaptchaVerifierRef.current =
        null;
    }

    const container =
      document.getElementById(
        'recaptcha-container'
      );

    if (container) {
      container.innerHTML = '';
    }
  }

  function getRecaptchaVerifier() {
    if (
      recaptchaVerifierRef.current
    ) {
      return (
        recaptchaVerifierRef.current
      );
    }

    const container =
      document.getElementById(
        'recaptcha-container'
      );

    if (!container) {
      throw new Error(
        'The security verification service is unavailable. Please refresh the page and try again.'
      );
    }

    container.innerHTML = '';

    const verifier =
      new RecaptchaVerifier(
        auth,
        container,
        {
          size: 'invisible',

          'expired-callback':
            () => {
              clearRecaptchaVerifier();
            },
        }
      );

    recaptchaVerifierRef.current =
      verifier;

    return verifier;
  }

  // =====================================================
  // CLEAN UP RECAPTCHA WHEN PAGE IS LEFT
  // =====================================================

  useEffect(() => {
    return () => {
      const verifier =
        recaptchaVerifierRef.current;

      if (verifier) {
        try {
          verifier.clear();
        } catch {
          // Ignore cleanup errors
          // while unmounting.
        }

        recaptchaVerifierRef.current =
          null;
      }
    };
  }, []);

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
      // BIZCENTRAL EMPLOYEE VERIFICATION
      //
      // Server checks:
      // - employee exists
      // - cellphone matches
      // - employee is employed
      // - last 6 ID via HMAC
      // - OTP request limits
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

            body:
              JSON.stringify({
                cellphone:
                  values.cellphone,

                idLastSix:
                  values.idLastSix,
              }),
          }
        );

      const result =
        await readApiResponse(
          response
        );

      if (!response.ok) {
        throw new Error(
          result.message ||
            'Unable to verify employee details.'
        );
      }

      if (
        result.success !== true
      ) {
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
        !/^\+27\d{9}$/.test(
          verifiedCellphone
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
    } catch (error: unknown) {
      clearRecaptchaVerifier();

      const firebaseError =
        error as {
          code?: string;
          message?: string;
        };

      let message =
        firebaseError.message ||
        'Unable to verify your employee details.';

      switch (
        firebaseError.code
      ) {
        case 'auth/operation-not-allowed':
          message =
            'Phone authentication is currently unavailable.';
          break;

        case 'auth/invalid-phone-number':
          message =
            'The cellphone number on your employee record is invalid.';
          break;

        case 'auth/unauthorized-domain':
          message =
            'This website is not authorised for cellphone verification.';
          break;

        case 'auth/captcha-check-failed':
        case 'auth/invalid-app-credential':
          message =
            'The security verification failed. Please try again.';
          break;

        case 'auth/too-many-requests':
          message =
            'Too many verification attempts have been made. Please try again later.';
          break;

        case 'auth/quota-exceeded':
          message =
            'The SMS verification service is temporarily unavailable. Please contact your administrator.';
          break;

        case 'auth/missing-phone-number':
          message =
            'No cellphone number was supplied for verification.';
          break;

        case 'auth/network-request-failed':
          message =
            'A network error occurred. Check your connection and try again.';
          break;
      }

      toast({
        variant:
          'destructive',

        title:
          'Unable to Activate',

        description:
          message,
      });
    } finally {
      setIsLoading(false);
    }
  }

  // =====================================================
  // STEP 2
  // VERIFY FIREBASE OTP
  // =====================================================

  async function handleOtp(
    values: OtpValues
  ) {
    setIsLoading(true);

    try {
      const confirmationResult =
        confirmationResultRef.current;

      if (
        !confirmationResult
      ) {
        throw new Error(
          'Your verification session has expired. Please request a new OTP.'
        );
      }

      const userCredential =
        await confirmationResult.confirm(
          values.otp
        );

      const firebaseUser =
        userCredential.user;

      if (
        !firebaseUser.uid
      ) {
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

      setStep(
        'create-pin'
      );

      toast({
        title:
          'Cellphone Verified',

        description:
          'Your cellphone has been verified successfully.',
      });
    } catch (error: unknown) {
      const firebaseError =
        error as {
          code?: string;
          message?: string;
        };

      let message =
        'The verification code is incorrect or has expired.';

      switch (
        firebaseError.code
      ) {
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

        case 'auth/network-request-failed':
          message =
            'A network error occurred. Check your connection and try again.';
          break;
      }

      toast({
        variant:
          'destructive',

        title:
          'Invalid OTP',

        description:
          message,
      });
    } finally {
      setIsLoading(false);
    }
  }

  // =====================================================
  // RESEND OTP
  //
  // Resend must pass through the server-side
  // OTP limiter before requesting another SMS.
  //
  // We will implement this in the next phase.
  // =====================================================

  async function handleResendOtp() {
    toast({
      title:
        'Please wait',

      description:
        'OTP resend is not yet enabled. Use Change number to restart verification.',
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

    setStep(
      'identify'
    );
  }

  // =====================================================
  // STEP 3
  // VALIDATE PIN
  //
  // IMPORTANT:
  //
  // The PIN is NOT stored here.
  //
  // Secure PIN persistence will be handled by the
  // server-side account activation endpoint.
  // =====================================================

  async function handleCreatePin(
    values: PinValues
    ) {
    setIsLoading(true);

    try {
        // =================================================
        // CONFIRM FIREBASE AUTHENTICATION
        // =================================================

        const firebaseUser =
        auth.currentUser;

        if (!firebaseUser) {
        throw new Error(
            'Your verified authentication session is missing. Please restart account activation.'
        );
        }

        if (
        !verifiedAuthUid ||
        firebaseUser.uid !== verifiedAuthUid
        ) {
        throw new Error(
            'Your authentication session could not be verified. Please restart account activation.'
        );
        }

        // =================================================
        // GET FRESH FIREBASE ID TOKEN
        //
        // The server will independently verify this token.
        // We do not send or trust a UID/cellphone supplied
        // directly by the browser.
        // =================================================

        const idToken =
        await firebaseUser.getIdToken(
            true
        );

        // =================================================
        // COMPLETE ACTIVATION SERVER-SIDE
        //
        // The server will:
        // - verify the Firebase token
        // - obtain verified UID + phone
        // - locate the employeePortal record
        // - bcrypt hash the PIN
        // - link authUid
        // - set portalActivated = true
        // =================================================

        const response =
        await fetch(
            '/api/staff/activation/complete',
            {
            method: 'POST',

            headers: {
                'Content-Type':
                'application/json',
            },

            body: JSON.stringify({
                idToken,
                pin: values.pin,
            }),
            }
        );

        const result =
        await readApiResponse(
            response
        );

        if (!response.ok) {
        throw new Error(
            result.message ||
            'Unable to activate your Employee Portal account.'
        );
        }

        if (
        result.success !== true
        ) {
        throw new Error(
            result.message ||
            'Unable to activate your Employee Portal account.'
        );
        }

        // =================================================
        // SUCCESS
        //
        // Only show completion AFTER the server confirms
        // that the employeePortal record was updated.
        // =================================================

        pinForm.reset({
        pin: '',
        confirmPin: '',
        });

        setShowPin(false);
        setShowConfirmPin(false);

        setStep('complete');

        toast({
        title:
            'Account Activated',

        description:
            'Your Employee Portal account has been activated successfully.',
        });
    } catch (error: unknown) {
        const activationError =
        error as {
            code?: string;
            message?: string;
        };

        let message =
        activationError.message ||
        'Unable to complete Employee Portal activation.';

        if (
        activationError.code ===
        'auth/network-request-failed'
        ) {
        message =
            'A network error occurred. Check your connection and try again.';
        }

        if (
        activationError.code ===
        'auth/user-token-expired'
        ) {
        message =
            'Your verification session has expired. Please restart account activation.';
        }

        toast({
        variant: 'destructive',

        title:
            'Activation Failed',

        description:
            message,
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

      {/* Firebase Phone Auth invisible reCAPTCHA */}

      <div
        id="recaptcha-container"
      />

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

          {step !==
            'complete' && (
            <div className="mb-7">

              <div className="flex items-center justify-between text-xs">

                <span
                  className={
                    step ===
                    'identify'
                      ? 'font-semibold text-primary'
                      : 'text-muted-foreground'
                  }
                >
                  Verify
                </span>

                <span
                  className={
                    step ===
                    'otp'
                      ? 'font-semibold text-primary'
                      : 'text-muted-foreground'
                  }
                >
                  OTP
                </span>

                <span
                  className={
                    step ===
                    'create-pin'
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

          {step ===
            'identify' && (

            <Form
              {...identifyForm}
            >

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
                  render={({
                    field,
                  }) => (

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
                  render={({
                    field,
                  }) => (

                    <FormItem>

                      <FormLabel>
                        Last 6 digits of ID Number
                      </FormLabel>

                      <FormControl>

                        <Input
                          type="password"
                          inputMode="numeric"
                          autoComplete="off"
                          maxLength={
                            6
                          }
                          {...field}
                          onChange={(
                            event
                          ) => {
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
                  disabled={
                    isLoading
                  }
                >
                  {isLoading
                    ? 'Checking...'
                    : 'Continue'}
                </Button>

              </form>

            </Form>
          )}

          {/* =================================================
              STEP 2 - OTP
          ================================================= */}

          {step ===
            'otp' && (

            <Form
              {...otpForm}
            >

              <form
                onSubmit={
                  otpForm.handleSubmit(
                    handleOtp
                  )
                }
                className="space-y-5"
              >

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

                <FormField
                  control={
                    otpForm.control
                  }
                  name="otp"
                  render={({
                    field,
                  }) => (

                    <FormItem>

                      <FormLabel>
                        Verification Code
                      </FormLabel>

                      <FormControl>

                        <Input
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={
                            6
                          }
                          className="text-center text-lg tracking-[0.4em]"
                          placeholder="000000"
                          {...field}
                          onChange={(
                            event
                          ) => {
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

                <Button
                  type="submit"
                  className="w-full"
                  disabled={
                    isLoading
                  }
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

          {step ===
            'create-pin' && (

            <Form
              {...pinForm}
            >

              <form
                onSubmit={
                  pinForm.handleSubmit(
                    handleCreatePin
                  )
                }
                className="space-y-5"
              >

                <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                  Choose a 6-digit PIN for your
                  Employee Portal account.
                </div>

                <FormField
                  control={
                    pinForm.control
                  }
                  name="pin"
                  render={({
                    field,
                  }) => (

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
                            autoComplete="new-password"
                            maxLength={
                              6
                            }
                            placeholder="••••••"
                            {...field}
                            onChange={(
                              event
                            ) => {
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
                                (
                                  current
                                ) =>
                                  !current
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

                <FormField
                  control={
                    pinForm.control
                  }
                  name="confirmPin"
                  render={({
                    field,
                  }) => (

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
                            autoComplete="new-password"
                            maxLength={
                              6
                            }
                            placeholder="••••••"
                            {...field}
                            onChange={(
                              event
                            ) => {
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
                                (
                                  current
                                ) =>
                                  !current
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
                  disabled={
                    isLoading
                  }
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

          {step ===
            'complete' && (

            <div className="space-y-5 text-center">

              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl">
                ✓
              </div>

              <div>

                <h2 className="text-xl font-semibold">
                  Account Activated
                </h2>

                <p className="mt-2 text-sm text-muted-foreground">
                Your Employee Portal account has been
                activated successfully.
                </p>

              </div>

              <Link
                href="/stafflogin"
              >

                <Button className="w-full">
                  Continue to Login
                </Button>

              </Link>

            </div>
          )}

        </div>

        {/* BACK */}

        {step !==
          'complete' && (

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