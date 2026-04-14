'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  // Supabase wysyła token w hash URL (#access_token=...&type=recovery)
  // @supabase/ssr automatycznie go obsługuje przy getSession()
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setReady(true);
      } else {
        setError('Link resetujący wygasł lub jest nieprawidłowy. Poproś o nowy.');
      }
    });
  }, [supabase.auth]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('Hasła nie są identyczne');
      return;
    }
    if (password.length < 8) {
      setError('Hasło musi mieć co najmniej 8 znaków');
      return;
    }

    setError('');
    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      router.push('/dashboard');
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">
            <span className="text-gray-900">e-</span>
            <span className="text-green-600">druczek</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">Ustaw nowe hasło</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          {!ready ? (
            <div className="text-center py-4">
              {error ? (
                <>
                  <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-4">{error}</p>
                  <a href="/login" className="text-sm text-green-600 hover:text-green-700 font-medium">
                    ← Wróć do logowania
                  </a>
                </>
              ) : (
                <p className="text-sm text-gray-500">Weryfikacja linku...</p>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nowe hasło
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="min. 8 znaków"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Powtórz hasło
                </label>
                <input
                  type="password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent ${
                    confirm && confirm !== password
                      ? 'border-red-400 focus:ring-red-400'
                      : 'border-gray-300 focus:ring-green-500'
                  }`}
                />
                {confirm && confirm !== password && (
                  <p className="mt-1 text-xs text-red-600">Hasła nie są identyczne</p>
                )}
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading || !password || password !== confirm}
                className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white font-medium py-2.5 px-4 rounded-lg transition-colors text-sm"
              >
                {loading ? 'Zapisywanie...' : 'Ustaw nowe hasło'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
