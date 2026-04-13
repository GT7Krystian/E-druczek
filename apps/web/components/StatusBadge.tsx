const STATUS_MAP: Record<string, { label: string; className: string }> = {
  DRAFT:               { label: 'Szkic',           className: 'bg-gray-100 text-gray-600' },
  QUEUED:              { label: 'W kolejce',        className: 'bg-yellow-100 text-yellow-700' },
  PROCESSING:          { label: 'Przetwarzanie',    className: 'bg-blue-100 text-blue-700 animate-pulse' },
  ACCEPTED:            { label: 'Zaakceptowano ✓',  className: 'bg-green-100 text-green-700' },
  REJECTED:            { label: 'Odrzucono ✗',      className: 'bg-red-100 text-red-700' },
  SEND_FAILED:         { label: 'Błąd wysyłki',     className: 'bg-red-100 text-red-700' },
  PROCESSING_TIMEOUT:  { label: 'Timeout',          className: 'bg-orange-100 text-orange-700' },
  LOCAL_ONLY:          { label: 'Tylko lokalnie',   className: 'bg-gray-100 text-gray-400' },
  OFFLINE24_PENDING:   { label: 'Offline24',        className: 'bg-orange-100 text-orange-700' },
};

export default function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, className: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.className}`}>
      {s.label}
    </span>
  );
}
