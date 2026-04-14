'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push('/dashboard');
        router.refresh();
      } else if (mode === 'register') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { invite_code: inviteCode } },
        });
        if (error) throw error;
        setMessage('Sprawdź email — wysłaliśmy link potwierdzający rejestrację.');
      } else {
        // forgot password
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
        });
        if (error) throw error;
        setMessage('Sprawdź email — wysłaliśmy link do resetowania hasła.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Wystąpił błąd');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">
            <span className="text-gray-900">e-</span>
            <span className="text-green-600">druczek</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">Faktury KSeF dla JDG</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          {/* Tabs — ukryte w trybie forgot */}
          {mode !== 'forgot' && (
            <div className="flex rounded-lg bg-gray-100 p-1 mb-6">
              <button
                onClick={() => { setMode('login'); setError(''); setMessage(''); }}
                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  mode === 'login' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Zaloguj się
              </button>
              <button
                onClick={() => { setMode('register'); setError(''); setMessage(''); }}
                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  mode === 'register' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Zarejestruj się
              </button>
            </div>
          )}

          {mode === 'forgot' && (
            <div className="mb-5">
              <button
                onClick={() => { setMode('login'); setError(''); setMessage(''); }}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3"
              >
                ← Wróć do logowania
              </button>
              <h2 className="text-base font-semibold text-gray-900">Resetuj hasło</h2>
              <p className="text-xs text-gray-500 mt-1">Wyślemy link resetujący na Twój adres email.</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jan@firma.pl"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            {mode !== 'forgot' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">Hasło</label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => { setMode('forgot'); setError(''); setMessage(''); }}
                      className="text-xs text-green-600 hover:text-green-700"
                    >
                      Zapomniałem hasła
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            )}

            {mode === 'register' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kod zaproszenia <span className="text-gray-400">(opcjonalnie)</span>
                </label>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="EDRUCZEK-XXXX"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}
            {message && (
              <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg border border-green-200">
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-lg transition-colors text-sm"
            >
              {loading ? 'Ładowanie...' :
               mode === 'login' ? 'Zaloguj się' :
               mode === 'register' ? 'Zarejestruj się' :
               'Wyślij link resetujący'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          Bez logowania. Bez konfiguracji. Działa od razu.
        </p>
      </div>
    </div>
  );
}
