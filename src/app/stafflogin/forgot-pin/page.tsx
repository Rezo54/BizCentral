'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { ConfirmationResult, RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';
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
      setStep(1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to start PIN reset.');
      captcha.current?.clear(); captcha.current = null;
    } finally { setBusy(false); }
  }

  async function verify() {
    setBusy(true); setMessage('');
    try {
      if (!confirmation.current) throw new Error('OTP session expired.');
      const credential = await confirmation.current.confirm(otp);
      verifiedIdToken.current = await credential.user.getIdToken();
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

  return <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4"><div className="w-full max-w-md rounded-xl border bg-background p-6 shadow-sm"><h1 className="text-2xl font-bold">Forgot PIN</h1><p className="mt-2 text-sm text-muted-foreground">Verify your cellphone before choosing a new PIN.</p><div className="mt-6 space-y-4">
    {step===0&&<><Input type="tel" placeholder="082 123 4567" value={phone} onChange={e=>setPhone(e.target.value)}/><Button className="w-full" disabled={busy} onClick={start}>Send verification code</Button></>}
    {step===1&&<><Input inputMode="numeric" maxLength={6} placeholder="6-digit OTP" value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,''))}/><Button className="w-full" disabled={busy} onClick={verify}>Verify OTP</Button></>}
    {step===2&&<><Input type="password" inputMode="numeric" maxLength={6} placeholder="New 6-digit PIN" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,''))}/><Input type="password" inputMode="numeric" maxLength={6} placeholder="Confirm PIN" value={confirmPin} onChange={e=>setConfirmPin(e.target.value.replace(/\D/g,''))}/><Button className="w-full" disabled={busy} onClick={finish}>Reset PIN</Button></>}
    {message&&<p className="text-sm">{message}</p>}<div id="reset-recaptcha"/><Link href="/stafflogin" className="text-sm text-blue-600 hover:underline">← Back to Employee Portal login</Link>
  </div></div></div>;
}
