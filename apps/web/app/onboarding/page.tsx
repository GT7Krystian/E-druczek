'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { isValidNip } from '@e-druczek/shared';

const VAT_OPTIONS = [
  { value: 'VAT_ACTIVE', label: 'Czynny podatnik VAT' },
  { value: 'VAT_EXEMPT_SUBJECTIVE', label: 'Zwolniony podmiotowo (art. 113)' },
  { value: 'VAT_EXEMPT_OBJECTIVE', label: 'Zwolniony przedmiotowo' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();

  const [form, setForm] = useState({
    nip: '',
    name: '',
    address_line1: '',
    address_line2: '',
    vat_status: 'VAT_ACTIVE',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidNip(form.nip)) {
      setError('Nieprawidłowy NIP — sprawdź czy numer jest poprawny');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Brak sesji');

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/companies`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify(form),
        },
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message ?? 'Błąd zapisu');
      }
      router.push('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Wystąpił błąd');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">
            <span className="text-gray-900">e-</span>
            <span className="text-green-600">druczek</span>
          </h1>
          <h2 className="text-lg font-semibold text-gray-900 mt-4">Dane firmy</h2>
          <p className="text-sm text-gray-500 mt-1">Uzupełnij raz — używaj zawsze</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">NIP</label>
              <input
                type="text"
                required
                maxLength={10}
                value={form.nip}
                onChange={(e) => set('nip', e.target.value.replace(/\D/g, ''))}
                placeholder="5260250274"
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent ${
                  form.nip.length === 10
                    ? isValidNip(form.nip)
                      ? 'border-green-400 focus:ring-green-500 bg-green-50'
                      : 'border-red-400 focus:ring-red-400 bg-red-50'
                    : 'border-gray-300 focus:ring-green-500'
                }`}
              />
              {form.nip.length === 10 && !isValidNip(form.nip) && (
                <p className="mt-1 text-xs text-red-600">Nieprawidłowy NIP — sprawdź numer</p>
              )}
              {form.nip.length === 10 && isValidNip(form.nip) && (
                <p className="mt-1 text-xs text-green-600">✓ NIP poprawny</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nazwa firmy</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Jan Kowalski Usługi IT"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Adres (ulica i numer)</label>
              <input
                type="text"
                required
                value={form.address_line1}
                onChange={(e) => set('address_line1', e.target.value)}
                placeholder="ul. Przykładowa 1/2"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kod pocztowy i miasto</label>
              <input
                type="text"
                required
                value={form.address_line2}
                onChange={(e) => set('address_line2', e.target.value)}
                placeholder="00-000 Warszawa"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status VAT</label>
              <div className="space-y-2">
                {VAT_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="vat_status"
                      value={opt.value}
                      checked={form.vat_status === opt.value}
                      onChange={() => set('vat_status', opt.value)}
                      className="accent-green-600"
                    />
                    <span className="text-sm text-gray-700">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-lg transition-colors text-sm"
            >
              {loading ? 'Zapisywanie...' : 'Zapisz i przejdź dalej'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
