'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import StatusBadge from '@/components/StatusBadge';

interface Invoice {
  id: string;
  invoice_number: string;
  issue_date: string;
  buyer_name: string;
  amount_gross: number;
  invoice_target: string;
  ksef_status: string;
  ksef_reference_number: string | null;
}

interface Company {
  id: string;
  name: string;
  nip: string;
  monthly_b2b_total: number;
}

const LIMIT_B2B = 10000;

function formatPln(amount: number) {
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(amount);
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('pl-PL');
}

export default function DashboardPage() {
  const supabase = createClient();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const token = session.access_token;
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;

      const [compRes, invRes] = await Promise.all([
        fetch(`${apiUrl}/companies`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/documents`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (compRes.ok) {
        const companies = await compRes.json();
        if (companies.length > 0) setCompany(companies[0]);
      }
      if (invRes.ok) {
        setInvoices(await invRes.json());
      }
      setLoading(false);
    }
    load();
  }, []);

  // SSE — real-time status updates
  useEffect(() => {
    if (!company) return;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    const es = new EventSource(`${apiUrl}/documents/status-stream`);
    es.onmessage = (e) => {
      try {
        const update = JSON.parse(e.data);
        setInvoices((prev) =>
          prev.map((inv) =>
            inv.id === update.id ? { ...inv, ksef_status: update.ksef_status, ksef_reference_number: update.ksef_reference_number } : inv,
          ),
        );
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, [company]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-400 text-sm">Ładowanie...</div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Nie masz jeszcze skonfigurowanej firmy.</p>
          <Link href="/onboarding" className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">
            Dodaj dane firmy
          </Link>
        </div>
      </div>
    );
  }

  const limitPercent = Math.min((company.monthly_b2b_total / LIMIT_B2B) * 100, 100);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{company.name}</h1>
          <p className="text-sm text-gray-500">NIP: {company.nip}</p>
        </div>
        <Link
          href="/invoices/new"
          className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + Nowa faktura
        </Link>
      </div>

      {/* Limit tracker */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-700">Limit B2B bez KSeF (miesięcznie)</span>
          <span className="text-sm font-semibold text-gray-900">
            {formatPln(company.monthly_b2b_total)} / {formatPln(LIMIT_B2B)}
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${limitPercent >= 90 ? 'bg-red-500' : limitPercent >= 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
            style={{ width: `${limitPercent}%` }}
          />
        </div>
        {limitPercent >= 90 && (
          <p className="text-xs text-red-600 mt-1">Uwaga: zbliżasz się do limitu 10 000 zł</p>
        )}
      </div>

      {/* Invoice list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Faktury ({invoices.length})</h2>
        </div>

        {invoices.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-gray-400 text-sm">Brak faktur. Wystaw pierwszą!</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {invoices.map((inv) => (
              <Link
                key={inv.id}
                href={`/invoices/${inv.id}`}
                className="flex items-center px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                {/* Mobile layout */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {inv.invoice_number}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${inv.invoice_target === 'B2B' ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-500'}`}>
                      {inv.invoice_target}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 truncate">{inv.buyer_name}</span>
                    <span className="text-xs text-gray-400">{formatDate(inv.issue_date)}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 ml-3">
                  <span className="text-sm font-semibold text-gray-900">{formatPln(inv.amount_gross)}</span>
                  <StatusBadge status={inv.ksef_status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
