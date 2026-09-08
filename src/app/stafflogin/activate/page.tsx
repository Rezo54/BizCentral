'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ConfirmationResult, RecaptchaVerifier, signInWithPhoneNumber, signOut } from 'firebase/auth';

import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

type Step = 'identify' | 'otp' | 'pin' | 'complete';
type ApiResult = { success?: boolean; code?: string; message?: string; cellphone?: string };

function cleanPhone(value: string) { return value.replace(/\D/g, ''); }
function displayPhone(value: string) {
  const d = cleanPhone(value);
  if (d.length === 11 && d.startsWith('27')) return `0${d.slice(2,4)} ${d.slice(4,7)} ${d.slice(7)}`;
  return value;
}
async function readApi(response: Response): Promise<ApiResult> {
  try { return await response.json() as ApiResult; }
  catch { return { success: false, message: 'The server returned an invalid response. Please try again.' }; }
}

export default function EmployeeActivatePage() {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>('identify');
  const [cellphoneInput, setCellphoneInput] = useState('');
  const [idLastSix, setIdLastSix] = useState('');
  const [verifiedPhone, setVerifiedPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [recaptchaKey, setRecaptchaKey] = useState(0);
  const confirmationRef = useRef<ConfirmationResult | null>(null);
  const verifierRef = useRef<RecaptchaVerifier | null>(null);
  const verifiedIdTokenRef = useRef('');

  function clearVerifier() {
    const verifier = verifierRef.current;
    verifierRef.current = null;
    if (verifier) { try { verifier.clear(); } catch {} }
    setRecaptchaKey((v) => v + 1);
  }

  function getVerifier() {
    if (verifierRef.current) return verifierRef.current;
    const el = document.getElementById('recaptcha-container');
    if (!el) throw new Error('The security verification service is unavailable. Please refresh and try again.');
    const verifier = new RecaptchaVerifier(auth, el, {
      size: 'invisible',
      'expired-callback': clearVerifier,
    });
    verifierRef.current = verifier;
    return verifier;
  }

  function restartVerification(showMessage = false) {
    confirmationRef.current = null;
    verifiedIdTokenRef.current = '';
    setOtp('');
    setSeconds(0);
    setVerifiedPhone('');
    clearVerifier();
    setStep('identify');
    if (showMessage) {
      toast({
        variant: 'destructive',
        title: 'Verification Code Expired',
        description: 'Your verification code has expired. Please restart verification to request a new code.',
      });
    }
  }

  useEffect(() => () => {
    const verifier = verifierRef.current;
    if (verifier) { try { verifier.clear(); } catch {} }
    verifierRef.current = null;
  }, []);

  useEffect(() => {
    if (step !== 'otp' || seconds <= 0) return;
    const timer = window.setTimeout(() => setSeconds((v) => Math.max(0, v - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [step, seconds]);

  useEffect(() => {
    if (step === 'otp' && seconds === 0 && confirmationRef.current) restartVerification(true);
  }, [step, seconds]);

  async function identify(event: React.FormEvent) {
    event.preventDefault();
    const local = cleanPhone(cellphoneInput);
    if (!/^0\d{9}$/.test(local) || !/^\d{6}$/.test(idLastSix)) {
      toast({ variant: 'destructive', title: 'Unable to Activate', description: 'Enter a valid cellphone number and the last 6 digits of your ID number.' });
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/staff/activation/check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cellphone: local, idLastSix }),
      });
      const result = await readApi(response);
      if (!response.ok || result.success !== true) throw new Error(result.message || 'Unable to verify employee details.');
      const phone = String(result.cellphone || '');
      if (!/^\+27\d{9}$/.test(phone)) throw new Error('The employee cellphone number could not be prepared for SMS verification.');
      setVerifiedPhone(phone);
      const confirmation = await signInWithPhoneNumber(auth, phone, getVerifier());
      confirmationRef.current = confirmation;
      setOtp('');
      setSeconds(60);
      setStep('otp');
      toast({ title: 'Verification Code Sent', description: 'A 6-digit verification code has been sent to your cellphone.' });
    } catch (error: unknown) {
      clearVerifier();
      const e = error as { code?: string; message?: string };
      let message = e.message || 'Unable to verify your employee details.';
      if (e.code === 'auth/captcha-check-failed' || e.code === 'auth/invalid-app-credential') message = 'The security verification failed. Please try again.';
      if (e.code === 'auth/too-many-requests') message = 'Too many verification attempts have been made. Please try again later.';
      toast({ variant: 'destructive', title: 'Unable to Activate', description: message });
    } finally { setLoading(false); }
  }

  async function verifyOtp(event: React.FormEvent) {
    event.preventDefault();
    if (seconds <= 0 || !confirmationRef.current) { restartVerification(true); return; }
    if (!/^\d{6}$/.test(otp)) return;
    setLoading(true);
    try {
      const credential = await confirmationRef.current.confirm(otp);
      if (!credential.user.uid) throw new Error('Unable to verify your cellphone.');
      verifiedIdTokenRef.current = await credential.user.getIdToken(true);
      await signOut(auth);
      confirmationRef.current = null;
      setSeconds(0);
      clearVerifier();
      setPin(''); setConfirmPin(''); setStep('pin');
      toast({ title: 'Cellphone Verified', description: 'Your cellphone has been verified successfully.' });
    } catch (error: unknown) {
      const e = error as { code?: string };
      const message = e.code === 'auth/invalid-verification-code' ? 'The verification code is incorrect.' : 'The verification code is incorrect or has expired.';
      toast({ variant: 'destructive', title: 'Invalid OTP', description: message });
    } finally { setLoading(false); }
  }

  async function createPin(event: React.FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(pin) || pin !== confirmPin) {
      toast({ variant: 'destructive', title: 'Activation Failed', description: 'Enter matching 6-digit PINs.' });
      return;
    }
    setLoading(true);
    try {
      const idToken = verifiedIdTokenRef.current;
      if (!idToken) throw new Error('Your verification session is missing. Please restart account activation.');
      const response = await fetch('/api/staff/activation/complete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken, pin }),
      });
      const result = await readApi(response);
      if (!response.ok || result.success !== true) throw new Error(result.message || 'Unable to activate your Employee Portal account.');
      verifiedIdTokenRef.current = '';
      setPin(''); setConfirmPin(''); setStep('complete');
      toast({ title: 'Account Activated', description: 'Your Employee Portal account has been activated successfully.' });
    } catch (error: unknown) {
      toast({ variant: 'destructive', title: 'Activation Failed', description: error instanceof Error ? error.message : 'Unable to complete Employee Portal activation.' });
    } finally { setLoading(false); }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-8">
      <div className="w-full max-w-md">
        <div key={recaptchaKey} id="recaptcha-container" />
        <div className="rounded-xl border bg-background p-6 shadow-sm">
          <h1 className="text-2xl font-bold">Activate Employee Account</h1>
          <p className="mt-2 text-sm text-muted-foreground">Set up access to your BizCentral Employee Portal</p>
          {step !== 'complete' && <div className="my-7 flex justify-between text-xs"><span className={step==='identify'?'font-semibold text-primary':'text-muted-foreground'}>Verify</span><span className={step==='otp'?'font-semibold text-primary':'text-muted-foreground'}>OTP</span><span className={step==='pin'?'font-semibold text-primary':'text-muted-foreground'}>Create PIN</span></div>}

          {step === 'identify' && <form onSubmit={identify} className="space-y-5">
            <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">Enter the cellphone number registered against your employee record.</p>
            <div><label className="text-sm font-medium">Cellphone Number</label><Input className="mt-2" value={cellphoneInput} onChange={(e)=>setCellphoneInput(e.target.value)} inputMode="numeric" placeholder="082 123 4567" /></div>
            <div><label className="text-sm font-medium">Last 6 digits of ID Number</label><Input className="mt-2" type="password" value={idLastSix} onChange={(e)=>setIdLastSix(e.target.value.replace(/\D/g,'').slice(0,6))} inputMode="numeric" maxLength={6} /></div>
            <Button className="w-full" disabled={loading}>{loading?'Checking...':'Continue'}</Button>
          </form>}

          {step === 'otp' && <form onSubmit={verifyOtp} className="space-y-5">
            <div className="text-center text-sm text-muted-foreground">Enter the 6-digit verification code sent to<br/><span className="font-medium text-foreground">{displayPhone(verifiedPhone)}</span></div>
            <div className="rounded-lg bg-muted/50 p-3 text-center text-sm"><span className="text-muted-foreground">Code expires in </span><span className="font-semibold tabular-nums">00:{String(seconds).padStart(2,'0')}</span></div>
            <div><label className="text-sm font-medium">Verification Code</label><Input className="mt-2 text-center text-lg tracking-[0.4em]" value={otp} onChange={(e)=>setOtp(e.target.value.replace(/\D/g,'').slice(0,6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" /></div>
            <Button className="w-full" disabled={loading || seconds<=0}>{loading?'Verifying...':'Verify OTP'}</Button>
            <button type="button" className="w-full text-sm text-muted-foreground hover:underline" onClick={()=>restartVerification(false)}>← Restart verification</button>
          </form>}

          {step === 'pin' && <form onSubmit={createPin} className="space-y-5">
            <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">Choose a 6-digit PIN for your Employee Portal account.</p>
            <div><label className="text-sm font-medium">Create PIN</label><Input className="mt-2" type={showPin?'text':'password'} value={pin} onChange={(e)=>setPin(e.target.value.replace(/\D/g,'').slice(0,6))} inputMode="numeric" maxLength={6}/><button type="button" onClick={()=>setShowPin(!showPin)} className="mt-1 text-xs text-muted-foreground">{showPin?'Hide PIN':'Show PIN'}</button></div>
            <div><label className="text-sm font-medium">Confirm PIN</label><Input className="mt-2" type="password" value={confirmPin} onChange={(e)=>setConfirmPin(e.target.value.replace(/\D/g,'').slice(0,6))} inputMode="numeric" maxLength={6}/></div>
            <Button className="w-full" disabled={loading}>{loading?'Activating...':'Activate Account'}</Button>
          </form>}

          {step === 'complete' && <div className="space-y-5 text-center"><div className="text-3xl">✓</div><h2 className="text-xl font-semibold">Account Activated</h2><p className="text-sm text-muted-foreground">Your Employee Portal account has been activated successfully.</p><Link href="/stafflogin"><Button className="w-full">Continue to Login</Button></Link></div>}
        </div>
        {step !== 'complete' && <div className="mt-5 text-center"><Link href="/stafflogin" className="text-sm text-muted-foreground hover:underline">← Back to Employee Login</Link></div>}
      </div>
    </div>
  );
}
