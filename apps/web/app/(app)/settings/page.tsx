'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Company {
  id: string;
  name: string;
  nip: string;
  vat_status: string;
}

interface KsefStatus {
  configured: boolean;
  tokenPreview: string | null;
  updatedAt: string | null;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function SettingsPage() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState<Company | null>(null);
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [ksefStatus, setKsefStatus] = useState<KsefStatus | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [accessToken, setAccessToken] = useState('');

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

  const loadKsefStatus = useCallback(async (companyId: string, jwt: string) => {
    const res = await fetch(`${apiUrl}/companies/${companyId}/ksef-status`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (res.ok) setKsefStatus(await res.json());
  }, [apiUrl]);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setEmail(session.user.email ?? '');
      setAccessToken(session.access_token);

      const res = await fetch(`${apiUrl}/companies`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data: Company[] = await res.json();
        if (data.length > 0) {
          setCompany(data[0]);
          await loadKsefStatus(data[0].id, session.access_token);
        }
      }
    }
    load();
  }, [apiUrl, loadKsefStatus, supabase.auth]);

  async function handleSaveToken(e: React.FormEvent) {
    e.preventDefault();
    if (!company || !token.trim()) return;

    setSaveState('saving');
    setSaveError('');

    const res = await fetch(`${apiUrl}/companies/${company.id}/ksef-token`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ token: token.trim() }),
    });

    if (res.ok) {
      const status: KsefStatus = await res.json();
      setKsefStatus(status);
      setToken('');
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 3000);
    } else {
      const err = await res.json();
      setSaveError(err.message ?? 'Błąd zapisu tokenu');
      setSaveState('error');
    }
  }

  async function handleDeleteToken() {
    if (!company) return;
    const res = await fetch(`${apiUrl}/companies/${company.id}/ksef-token`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok || res.status === 204) {
      setKsefStatus({ configured: false, tokenPreview: null, updatedAt: null });
      setDeleteConfirm(false);
    }
  }

  const vatLabel: Record<string, string> = {
    VAT_ACTIVE: 'Czynny podatnik VAT',
    VAT_EXEMPT_SUBJECTIVE: 'Zwolnienie podmiotowe',
    VAT_EXEMPT_OBJECTIVE: 'Zwolnienie przedmiotowe',
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-4">
      <h1 className="text-lg font-semibold text-gray-900">Ustawienia</h1>

      {/* Konto */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Konto</p>
        <p className="text-sm text-gray-900">{email || '—'}</p>
      </div>

      {/* Firma */}
      {company && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Firma</p>
          <div className="space-y-1">
            <p className="text-sm font-medium text-gray-900">{company.name}</p>
            <p className="text-xs text-gray-500">NIP: {company.nip}</p>
            <p className="text-xs text-gray-500">{vatLabel[company.vat_status] ?? company.vat_status}</p>
          </div>
        </div>
      )}

      {/* KSeF */}
      {company && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">
            Połączenie z KSeF
          </p>

          {/* Status badge */}
          <div className="flex items-center gap-2 mb-4">
            {ksefStatus === null ? (
              <span className="text-xs text-gray-400">Sprawdzanie...</span>
            ) : ksefStatus.configured ? (
              <>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                  Połączono z KSeF
                </span>
                <span className="text-xs text-gray-400 font-mono">{ksefStatus.tokenPreview}</span>
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                Brak tokenu — faktury nie będą wysyłane do KSeF
              </span>
            )}
          </div>

          {ksefStatus?.updatedAt && (
            <p className="text-xs text-gray-400 mb-4">
              Ostatnia aktualizacja: {new Date(ksefStatus.updatedAt).toLocaleString('pl-PL')}
            </p>
          )}

          {/* Instrukcja */}
          <details className="mb-4">
            <summary className="text-xs text-green-700 cursor-pointer hover:text-green-800 font-medium select-none">
              Jak uzyskać token KSeF? ▸
            </summary>
            <ol className="mt-2 space-y-1 text-xs text-gray-600 list-decimal list-inside">
              <li>Wejdź na <a href="https://ksef.mf.gov.pl" target="_blank" rel="noreferrer" className="text-green-700 underline">ksef.mf.gov.pl</a></li>
              <li>Zaloguj się przez ePUAP lub profil zaufany</li>
              <li>Przejdź do: <strong>Ustawienia → Tokeny API</strong></li>
              <li>Kliknij <strong>Wygeneruj nowy token</strong></li>
              <li>Skopiuj cały token i wklej poniżej</li>
            </ol>
            <p className="mt-2 text-xs text-gray-400">
              Środowisko testowe:{' '}
              <a href="https://ksef-test.mf.gov.pl" target="_blank" rel="noreferrer" className="underline">
                ksef-test.mf.gov.pl
              </a>
            </p>
          </details>

          {/* Formularz tokenu */}
          <form onSubmit={handleSaveToken} className="space-y-3">
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={e => {
                  setToken(e.target.value);
                  setSaveState('idle');
                  setSaveError('');
                }}
                placeholder={
                  ksefStatus?.configured
                    ? 'Wklej nowy token aby zaktualizować'
                    : 'Wklej token KSeF...'
                }
                className="w-full text-xs font-mono rounded-lg border border-gray-300 px-3 py-2.5 pr-16 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent placeholder:text-gray-400 bg-gray-50"
                autoComplete="off"
                spellCheck={false}
              />
              {token && (
                <button
                  type="button"
                  onClick={() => setShowToken(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 font-medium"
                >
                  {showToken ? 'Ukryj' : 'Pokaż'}
                </button>
              )}
            </div>

            {saveError && (
              <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 border border-red-100">
                {saveError}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!token.trim() || saveState === 'saving'}
                className="flex-1 rounded-lg bg-green-600 text-white text-sm font-medium py-2.5 disabled:opacity-40 hover:bg-green-700 active:bg-green-800 transition-colors"
              >
                {saveState === 'saving'
                  ? 'Zapisywanie...'
                  : saveState === 'saved'
                  ? '✓ Zapisano'
                  : ksefStatus?.configured
                  ? 'Zaktualizuj token'
                  : 'Zapisz token'}
              </button>

              {ksefStatus?.configured && !deleteConfirm && (
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(true)}
                  className="rounded-lg border border-red-200 text-red-500 text-sm font-medium px-3 py-2.5 hover:bg-red-50 transition-colors"
                >
                  Odłącz
                </button>
              )}
            </div>
          </form>

          {/* Potwierdzenie usunięcia */}
          {deleteConfirm && (
            <div className="mt-3 rounded-lg bg-red-50 border border-red-200 p-3">
              <p className="text-xs font-medium text-red-700 mb-1">Usunąć połączenie z KSeF?</p>
              <p className="text-xs text-red-600 mb-3">
                Faktury nie będą wysyłane do KSeF do czasu dodania nowego tokenu.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDeleteToken}
                  className="rounded-lg bg-red-600 text-white text-xs font-medium px-3 py-1.5 hover:bg-red-700"
                >
                  Tak, odłącz
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(false)}
                  className="rounded-lg border border-gray-200 text-gray-600 text-xs font-medium px-3 py-1.5 hover:bg-gray-50"
                >
                  Anuluj
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
