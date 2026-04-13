'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function SettingsPage() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState<any>(null);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setEmail(session.user.email ?? '');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/companies`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.length > 0) setCompany(data[0]);
      }
    }
    load();
  }, []);

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <h1 className="text-lg font-semibold text-gray-900 mb-6">Ustawienia</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <p className="text-xs font-medium text-gray-500 mb-2">KONTO</p>
        <p className="text-sm text-gray-900">{email}</p>
      </div>

      {company && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-medium text-gray-500 mb-3">FIRMA</p>
          <div className="space-y-1">
            <p className="text-sm font-medium text-gray-900">{company.name}</p>
            <p className="text-xs text-gray-500">NIP: {company.nip}</p>
            <p className="text-xs text-gray-500">Status VAT: {company.vat_status}</p>
          </div>
        </div>
      )}
    </div>
  );
}
