import { useState, type FormEvent } from 'react';
import { LockKeyhole, Loader2, Mail } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface AuthScreenProps {
  recoveryMode: boolean;
  authError: string | null;
  onRecoveryComplete: () => void;
}

export function AuthScreen({ recoveryMode, authError, onRecoveryComplete }: AuthScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'sign-in' | 'forgot-password'>('sign-in');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setIsSubmitting(true);

    try {
      if (recoveryMode) {
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        setPassword('');
        onRecoveryComplete();
        return;
      }

      if (mode === 'forgot-password') {
        const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        if (resetError) throw resetError;
        setNotice('If an invited account exists for this email address, you will receive a link to reset your password.');
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isRecovery = recoveryMode;
  const isForgotPassword = !isRecovery && mode === 'forgot-password';

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <section className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#002B49] text-white">
            {isForgotPassword ? <Mail className="h-5 w-5" /> : <LockKeyhole className="h-5 w-5" />}
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Lead Scanner</h1>
            <p className="text-xs text-slate-500">
              {isRecovery ? 'Set a new password' : isForgotPassword ? 'Reset your password' : 'Sign in'}
            </p>
          </div>
        </div>

        <p className="mb-5 text-sm leading-relaxed text-slate-600">
          {isRecovery
            ? 'Choose a new password for your invited account.'
            : isForgotPassword
              ? 'Enter the email address for your invited account.'
              : 'Only invited team members can access lead data.'}
        </p>

        <form onSubmit={submit} className="space-y-4">
          {!isRecovery && (
            <div>
              <label htmlFor="auth-email" className="mb-1 block text-xs font-semibold text-slate-700">Email address</label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-transparent focus:ring-2 focus:ring-[#002B49]"
              />
            </div>
          )}

          {!isForgotPassword && (
            <div>
              <label htmlFor="auth-password" className="mb-1 block text-xs font-semibold text-slate-700">
                {isRecovery ? 'New password' : 'Password'}
              </label>
              <input
                id="auth-password"
                type="password"
                autoComplete={isRecovery ? 'new-password' : 'current-password'}
                minLength={isRecovery ? 8 : undefined}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-transparent focus:ring-2 focus:ring-[#002B49]"
              />
            </div>
          )}

          {(error || authError) && (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
              {error || authError}
            </p>
          )}
          {notice && (
            <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-700 disabled:cursor-wait disabled:opacity-60"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isRecovery ? 'Save password' : isForgotPassword ? 'Send reset link' : 'Sign in'}
          </button>
        </form>

        {!isRecovery && (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setNotice(null);
              setPassword('');
              setMode(isForgotPassword ? 'sign-in' : 'forgot-password');
            }}
            className="mt-4 w-full text-center text-xs font-medium text-blue-900 hover:underline"
          >
            {isForgotPassword ? 'Back to sign in' : 'Forgot password?'}
          </button>
        )}
      </section>
    </main>
  );
}
