'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ConfirmationResult, RecaptchaVerifier, signInWithPhoneNumber, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ForgotPinPage() {
  const [step, setStep] = useState(0);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [seconds, setSeconds] = useState(0);
  const confirmation = useRef<ConfirmationResult | null>(null);
  const captcha = useRef<RecaptchaVerifier | null>(null);
  const verifiedIdToken = useRef<string>('');

  async function start() {
    setBusy(true); setMessage(''); verifiedIdToken.current = '';
    try {
      const response = await fetch('/api/staff/reset-pin/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ cellphone: phone }) });
      const data = await response.json();
      if (!response.ok || data?.success !== true) throw new Error(data?.message || 'Unable to start PIN reset.');
      const element = document.getElementById('reset-recaptcha');
      if (!element) throw new Error('Security verification unavailable.');
      element.innerHTML = '';
      captcha.current?.clear();
      captcha.current = new RecaptchaVerifier(auth, element, { size: 'invisible' });
      confirmation.current = await signInWithPhoneNumber(auth, data.cellphone, captcha.current);
      setSeconds(60);
      setStep(1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to start PIN reset.');
      captcha.current?.clear(); captcha.current = null;
    } finally { setBusy(false); }
  }

  useEffect(() => {
    if (step !== 1 || seconds <= 0) return;
    const timer = window.setTimeout(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [step, seconds]);

  async function verify() {
    setBusy(true); setMessage('');
    try {
      if (!confirmation.current || seconds <= 0) throw new Error('OTP session expired.');
      const credential = await confirmation.current.confirm(otp);
      verifiedIdToken.current = await credential.user.getIdToken(true);
      await signOut(auth);
      confirmation.current = null;
      setSeconds(0);
      setStep(2);
    } catch { setMessage('The OTP is incorrect or expired.'); }
    finally { setBusy(false); }
  }

  async function finish() {
    if (!/^\d{6}$/.test(pin) || pin !== confirmPin) { setMessage('Enter matching 6-digit PINs.'); return; }
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/staff/reset-pin/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ idToken: verifiedIdToken.current, pin }) });
      const data = await response.json();
      if (!response.ok || data?.success !== true) throw new Error(data?.message || 'Unable to reset PIN.');
      verifiedIdToken.current = '';
      setStep(3); setMessage('PIN reset successfully. You can now login.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to reset PIN.'); }
    finally { setBusy(false); }
  }

  return <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4"><div className="w-full max-w-md rounded-xl border bg-background p-6 shadow-sm"><div className="mb-5 flex justify-center"><Image src="/logo.png" alt="Taskraft Solutions That Work" width={180} height={74} priority /></div><h1 className="text-2xl font-bold">Forgot PIN</h1><p className="mt-2 text-sm text-muted-foreground">Verify your cellphone before choosing a new PIN.</p><div className="mt-6 space-y-4">
    {step===0&&<><Input type="tel" placeholder="082 123 4567" value={phone} onChange={e=>setPhone(e.target.value)}/><Button className="w-full" disabled={busy} onClick={start}>Send verification code</Button></>}
    {step===1&&<><div className="rounded-lg bg-muted/50 p-3 text-center text-sm"><span className="text-muted-foreground">Code expires in </span><span className="font-semibold tabular-nums">00:{String(seconds).padStart(2,'0')}</span></div><Input inputMode="numeric" maxLength={6} placeholder="6-digit OTP" value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,''))}/><Button className="w-full" disabled={busy||seconds<=0} onClick={verify}>Verify OTP</Button></>}
    {step===2&&<><Input type="password" inputMode="numeric" maxLength={6} placeholder="New 6-digit PIN" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,''))}/><Input type="password" inputMode="numeric" maxLength={6} placeholder="Confirm PIN" value={confirmPin} onChange={e=>setConfirmPin(e.target.value.replace(/\D/g,''))}/><Button className="w-full" disabled={busy} onClick={finish}>Reset PIN</Button></>}
    {message&&<p className="text-sm">{message}</p>}<div id="reset-recaptcha"/><Link href="/stafflogin" className="text-sm text-blue-600 hover:underline">← Back to Employee Portal login</Link>
  </div></div></div>;
}
