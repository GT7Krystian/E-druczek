'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import StatusBadge from '@/components/StatusBadge';

interface DocumentItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unit_price_net: number;
  vat_rate: string;
  total_net: number;
  total_vat: number;
  total_gross: number;
}

interface Invoice {
  id: string;
  invoice_number: string;
  issue_date: string;
  buyer_name: string;
  buyer_nip: string | null;
  amount_gross: number;
  invoice_target: string;
  ksef_status: string;
  ksef_reference_number: string | null;
  pdf_status: string;
  pdf_url: string | null;
  document_items: DocumentItem[];
}

function fmt(n: number) {
  return new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2 }).format(n);
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/documents/${id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) setInvoice(await res.json());
      setLoading(false);
    }
    load();
  }, [id]);

  // SSE for real-time status
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    const es = new EventSource(`${apiUrl}/documents/${id}/status-stream`);
    es.onmessage = (e) => {
      try {
        const update = JSON.parse(e.data);
        setInvoice((prev) => prev ? { ...prev, ...update } : prev);
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, [id]);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/documents/${id}/submit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      setInvoice((prev) => prev ? { ...prev, ksef_status: 'QUEUED' } : prev);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="flex justify-center items-center min-h-[60vh] text-gray-400 text-sm">Ładowanie...</div>;
  if (!invoice) return <div className="flex justify-center items-center min-h-[60vh] text-gray-400 text-sm">Nie znaleziono faktury.</div>;

  const items = invoice.document_items ?? [];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">←</button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-gray-900">{invoice.invoice_number}</h1>
          <p className="text-xs text-gray-400">{new Date(invoice.issue_date).toLocaleDateString('pl-PL')}</p>
        </div>
        <StatusBadge status={invoice.ksef_status} />
      </div>

      {/* KSeF number */}
      {invoice.ksef_reference_number && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
          <p className="text-xs font-medium text-green-700 mb-1">Numer KSeF</p>
          <p className="text-sm font-mono text-green-900 break-all">{invoice.ksef_reference_number}</p>
        </div>
      )}

      {/* Buyer */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <p className="text-xs font-medium text-gray-500 mb-2">NABYWCA</p>
        <p className="text-sm font-medium text-gray-900">{invoice.buyer_name}</p>
        {invoice.buyer_nip && <p className="text-xs text-gray-500">NIP: {invoice.buyer_nip}</p>}
      </div>

      {/* Items */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <p className="text-xs font-medium text-gray-500 mb-3">POZYCJE</p>
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex justify-between items-start py-2 border-b border-gray-50 last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900">{item.name}</p>
                <p className="text-xs text-gray-400">{item.quantity} {item.unit} × {fmt(item.unit_price_net)} zł · VAT {item.vat_rate === 'zw' ? 'ZW' : `${item.vat_rate}%`}</p>
              </div>
              <div className="text-right ml-3">
                <p className="text-sm font-medium text-gray-900">{fmt(item.total_gross)} zł</p>
                <p className="text-xs text-gray-400">netto {fmt(item.total_net)}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-gray-200 flex justify-between items-center">
          <span className="text-sm font-semibold text-gray-700">Razem brutto</span>
          <span className="text-lg font-bold text-gray-900">{fmt(invoice.amount_gross)} zł</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        {invoice.ksef_status === 'DRAFT' && invoice.invoice_target === 'B2B' && (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {submitting ? 'Wysyłanie...' : 'Wyślij do KSeF'}
          </button>
        )}
        {invoice.pdf_url && (
          <a
            href={invoice.pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 text-center"
          >
            Pobierz PDF
          </a>
        )}
        <button
          onClick={() => router.push(`/invoices/${id}/correct`)}
          className="py-2.5 px-4 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
        >
          Korekta
        </button>
      </div>
    </div>
  );
}
