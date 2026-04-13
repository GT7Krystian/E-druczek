'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const VAT_RATES = ['23', '8', '5', '0', 'zw', 'np'];
const ZW_REASONS = [
  'art. 43 ust. 1 pkt 1 ustawy o VAT',
  'art. 43 ust. 1 pkt 18 ustawy o VAT',
  'art. 113 ust. 1 ustawy o VAT',
  'art. 113 ust. 9 ustawy o VAT',
];

interface LineItem {
  name: string;
  quantity: string;
  unit: string;
  unit_price_net: string;
  vat_rate: string;
  total_net: number;
  total_vat: number;
  total_gross: number;
  vat_exemption_text: string;
}

function emptyLine(): LineItem {
  return { name: '', quantity: '1', unit: 'szt', unit_price_net: '', vat_rate: '23', total_net: 0, total_vat: 0, total_gross: 0, vat_exemption_text: '' };
}

function calcLine(item: LineItem): LineItem {
  const qty = parseFloat(item.quantity) || 0;
  const net = parseFloat(item.unit_price_net) || 0;
  const totalNet = Math.round(qty * net * 100) / 100;
  const rate = item.vat_rate === 'zw' || item.vat_rate === 'np' ? 0 : (parseFloat(item.vat_rate) / 100);
  const totalVat = Math.round(totalNet * rate * 100) / 100;
  return { ...item, total_net: totalNet, total_vat: totalVat, total_gross: Math.round((totalNet + totalVat) * 100) / 100 };
}

function fmt(n: number) {
  return new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2 }).format(n);
}

export default function NewInvoicePage() {
  const router = useRouter();
  const supabase = createClient();

  const [target, setTarget] = useState<'B2B' | 'B2C'>('B2B');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [buyerNip, setBuyerNip] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerAddress, setBuyerAddress] = useState('');
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadCompanies() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/companies`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCompanies(data);
        if (data.length > 0) setCompanyId(data[0].id);
      }
    }
    loadCompanies();
    // Auto invoice number
    const now = new Date();
    setInvoiceNumber(`FV/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`);
  }, []);

  function updateLine(idx: number, field: keyof LineItem, value: string) {
    setLines((prev) => {
      const next = [...prev];
      next[idx] = calcLine({ ...next[idx], [field]: value });
      return next;
    });
  }

  function addLine() { setLines((p) => [...p, emptyLine()]); }
  function removeLine(idx: number) { setLines((p) => p.filter((_, i) => i !== idx)); }

  const totalGross = lines.reduce((s, l) => s + l.total_gross, 0);

  async function handleSubmit(submit: boolean) {
    if (!companyId) { setError('Brak firmy — przejdź do onboardingu'); return; }
    setError('');
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Brak sesji');

      const body = {
        company_id: companyId,
        direction: 'outgoing',
        invoice_target: target,
        document_class: 'FAKTURA_PIERWOTNA',
        amount_gross: Math.round(totalGross * 100) / 100,
        invoice_number: invoiceNumber,
        issue_date: issueDate,
        buyer_nip: target === 'B2B' ? buyerNip : undefined,
        buyer_name: buyerName,
        buyer_address_line1: buyerAddress || undefined,
        items: lines.map((l) => ({
          name: l.name,
          quantity: parseFloat(l.quantity) || 1,
          unit: l.unit,
          unit_price_net: parseFloat(l.unit_price_net) || 0,
          vat_rate: l.vat_rate,
          total_net: l.total_net,
          total_vat: l.total_vat,
          total_gross: l.total_gross,
          vat_exemption_text: l.vat_exemption_text || undefined,
        })),
      };

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message ?? 'Błąd zapisu'); }
      const doc = await res.json();

      if (submit && target === 'B2B') {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/documents/${doc.id}/submit`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
      }

      router.push(`/invoices/${doc.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Błąd');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">←</button>
        <h1 className="text-lg font-semibold text-gray-900">Nowa faktura</h1>
      </div>

      <div className="space-y-4">
        {/* B2B / B2C toggle */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-700 mb-2">Typ faktury</p>
          <div className="flex rounded-lg bg-gray-100 p-1 w-fit">
            {(['B2B', 'B2C'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTarget(t)}
                className={`px-6 py-1.5 text-sm font-medium rounded-md transition-colors ${target === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
              >
                {t}
              </button>
            ))}
          </div>
          {target === 'B2C' && (
            <p className="text-xs text-gray-400 mt-2">Faktury B2C nie są wysyłane do KSeF.</p>
          )}
        </div>

        {/* Basic info */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Numer faktury</label>
              <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data wystawienia</label>
              <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
          </div>
        </div>

        {/* Buyer */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <p className="text-sm font-medium text-gray-700">Dane nabywcy</p>
          {target === 'B2B' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">NIP nabywcy</label>
              <input value={buyerNip} onChange={(e) => setBuyerNip(e.target.value.replace(/\D/g, ''))}
                maxLength={10} placeholder="1234567890"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nazwa</label>
            <input value={buyerName} onChange={(e) => setBuyerName(e.target.value)}
              placeholder="Firma ABC Sp. z o.o."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Adres</label>
            <input value={buyerAddress} onChange={(e) => setBuyerAddress(e.target.value)}
              placeholder="ul. Przykładowa 1, 00-000 Warszawa"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
        </div>

        {/* Line items */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-700 mb-3">Pozycje faktury</p>
          <div className="space-y-3">
            {lines.map((line, idx) => (
              <div key={idx} className="border border-gray-100 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500">Pozycja {idx + 1}</span>
                  {lines.length > 1 && (
                    <button onClick={() => removeLine(idx)} className="text-xs text-red-400 hover:text-red-600">Usuń</button>
                  )}
                </div>
                <input value={line.name} onChange={(e) => updateLine(idx, 'name', e.target.value)}
                  placeholder="Nazwa usługi / towaru"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Ilość</label>
                    <input type="number" value={line.quantity} onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Jednostka</label>
                    <input value={line.unit} onChange={(e) => updateLine(idx, 'unit', e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Stawka VAT</label>
                    <select value={line.vat_rate} onChange={(e) => updateLine(idx, 'vat_rate', e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
                      {VAT_RATES.map((r) => <option key={r} value={r}>{r === 'zw' ? 'ZW' : r === 'np' ? 'NP' : `${r}%`}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Cena netto (zł)</label>
                  <input type="number" step="0.01" value={line.unit_price_net} onChange={(e) => updateLine(idx, 'unit_price_net', e.target.value)}
                    placeholder="0.00"
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                {(line.vat_rate === 'zw' || line.vat_rate === 'np') && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Podstawa zwolnienia</label>
                    <select value={line.vat_exemption_text} onChange={(e) => updateLine(idx, 'vat_exemption_text', e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
                      <option value="">Wybierz...</option>
                      {ZW_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                )}
                {line.total_gross > 0 && (
                  <div className="flex justify-end text-xs text-gray-500">
                    netto {fmt(line.total_net)} + VAT {fmt(line.total_vat)} = <span className="font-semibold text-gray-900 ml-1">{fmt(line.total_gross)} zł</span>
                  </div>
                )}
              </div>
            ))}
          </div>
          <button onClick={addLine} className="mt-3 w-full py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-green-400 hover:text-green-600 transition-colors">
            + Dodaj pozycję
          </button>
        </div>

        {/* Summary */}
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Razem brutto</span>
            <span className="text-xl font-bold text-gray-900">{fmt(totalGross)} zł</span>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

        {/* Actions */}
        <div className="flex gap-3 pb-4">
          <button onClick={() => handleSubmit(false)} disabled={loading}
            className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors">
            Zapisz szkic
          </button>
          {target === 'B2B' && (
            <button onClick={() => handleSubmit(true)} disabled={loading}
              className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
              {loading ? 'Wysyłanie...' : 'Wyślij do KSeF'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
